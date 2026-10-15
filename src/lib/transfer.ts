import { prepareQuiz, withData, type OfflineData } from "./offline";
import type { Quiz, History } from "./api";
import {
  studySignature,
  legacyStudySignature,
  validStudyProgress,
  type StudyProgress,
} from "./study-progress";

export async function exportData(quiz?: Quiz): Promise<string> {
  const payload = quiz
    ? { format: "quizcraft-quizzes", version: 1, quizzes: [quiz] }
    : await withData((data) => ({
        ...data,
        attempts: data.attempts.filter((a) => a.result),
      }));
  return JSON.stringify(payload, null, 2);
}
export function downloadData(text: string, filename: string) {
  const url = URL.createObjectURL(
    new Blob([text], { type: "application/json" }),
  );
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export async function importQuizzes(text: string) {
  if (text.length > 30_000_000)
    throw new Error("Choose a file smaller than 30 MB.");
  const payload = JSON.parse(text);
  const values = payload.quizzes;
  if (!Array.isArray(values) || !values.length || values.length > 1000)
    throw new Error("This file does not contain quizzes.");
  const quizzes = values.map(prepareQuiz);
  await withData((data) => {
    data.quizzes.push(...quizzes);
  });
  return quizzes.length;
}
export async function restoreBackup(text: string) {
  if (text.length > 30_000_000)
    throw new Error("Choose a file smaller than 30 MB.");
  const payload: OfflineData = JSON.parse(text);
  if (
    payload.version !== 1 ||
    !Array.isArray(payload.quizzes) ||
    !Array.isArray(payload.bookmarks) ||
    !Array.isArray(payload.attempts) ||
    !payload.user ||
    typeof payload.user.name !== "string" ||
    payload.quizzes.length > 1000
  )
    throw new Error("Invalid QuizCraft backup.");
  const validId = (id: unknown): id is string =>
    typeof id === "string" &&
    !!id &&
    !["__proto__", "constructor", "prototype"].includes(id);
  const ids = new Set<string>();
  const quizzes = payload.quizzes.map((q) => {
    if (!validId(q.id) || ids.has(q.id))
      throw new Error("Invalid quiz identifiers in backup.");
    ids.add(q.id);
    const quiz = { ...prepareQuiz(q), id: q.id };
    const questionIds = new Set<string>();
    quiz.questions!.forEach((card, index) => {
      const id = q.questions![index].id;
      if (!validId(id) || questionIds.has(id))
        throw new Error("Invalid question identifiers in backup.");
      questionIds.add(id);
      card.id = id;
    });
    return quiz;
  });
  const studyProgress: Record<string, StudyProgress> = {};
  if (
    payload.studyProgress !== undefined &&
    (!payload.studyProgress ||
      typeof payload.studyProgress !== "object" ||
      Array.isArray(payload.studyProgress))
  )
    throw new Error("Invalid study progress in backup.");
  await Promise.all(
    quizzes.map(async (quiz, index) => {
      const saved = payload.studyProgress?.[quiz.id];
      if (!saved) return;
      const original = payload.quizzes[index];
      const signature = await studySignature(original);
      // Ignore progress for questions that had already been edited before export.
      if (
        saved.signature !== signature &&
        saved.signature !== (await legacyStudySignature(original)) &&
        saved.signature !==
          JSON.stringify([original.questions, original.settings])
      )
        return;
      if (!validStudyProgress(quiz, saved))
        throw new Error("Invalid study progress in backup.");
      studyProgress[quiz.id] = {
        ...saved,
        signature: await studySignature(quiz),
      };
    }),
  );
  if (
    payload.studySessions !== undefined &&
    !Array.isArray(payload.studySessions)
  )
    throw new Error("Invalid study history in backup.");
  const sessionIds = new Set<string>();
  const studySessions: History[] = (payload.studySessions || []).map(
    (session) => {
      if (
        !session ||
        !validId(session.id) ||
        sessionIds.has(session.id) ||
        !ids.has(session.quiz_id) ||
        session.kind !== "flashcards" ||
        typeof session.title !== "string" ||
        !Number.isFinite(session.started) ||
        !Number.isFinite(session.submitted) ||
        session.submitted < session.started ||
        !Number.isFinite(session.maximum) ||
        session.maximum <= 0 ||
        !Number.isFinite(session.score) ||
        session.score < 0 ||
        session.score > session.maximum ||
        !Number.isInteger(session.correct) ||
        session.correct < 0 ||
        session.pending !== 0
      )
        throw new Error("Invalid study history in backup.");
      sessionIds.add(session.id);
      return {
        ...session,
        name: String(session.name || "Learner").slice(0, 80),
      };
    },
  );
  const attempts = payload.attempts.map((a) => {
    const quiz = prepareQuiz(a.quiz);
    if (
      !Number.isFinite(a.started) ||
      !Array.isArray(a.questions) ||
      !a.result ||
      !Number.isFinite(a.result.submitted) ||
      !Array.isArray(a.result.responses)
    )
      throw new Error("Only completed attempts can be restored.");
    const questions = prepareQuiz({
      ...quiz,
      questions: a.questions,
    }).questions!;
    const responses = questions.map((q, i) => {
      const r = a.result.responses[i];
      if (
        !r ||
        (r.earned !== null &&
          (!Number.isFinite(r.earned) || r.earned < 0 || r.earned > q.points))
      )
        throw new Error("Invalid scores in backup.");
      return {
        question_id: q.id,
        prompt: q.prompt,
        accepted: q.accepted,
        explanation: q.explanation,
        points: q.points,
        answer: String(r.answer || ""),
        earned: r.earned,
      };
    });
    const id = crypto.randomUUID();
    return {
      id,
      quiz: { ...quiz, id: String(a.quiz.id) },
      questions,
      started: a.started,
      deadline: null,
      answers: {},
      name: String(a.name || "Learner").slice(0, 80),
      public: !!a.public,
      preview: !!a.preview,
      result: {
        id,
        quiz: { ...quiz, id: String(a.quiz.id) },
        started: a.started,
        submitted: a.result.submitted,
        responses,
        total: questions.length,
        maximum: questions.reduce((sum, q) => sum + q.points, 0),
        score: responses.reduce((sum, r) => sum + (r.earned ?? 0), 0),
        pending: responses.filter((r) => r.earned === null).length,
        correct: responses.filter((r) => r.earned === r.points).length,
      },
    };
  });
  await withData((data) => {
    data.quizzes = quizzes;
    data.bookmarks = payload.bookmarks.filter((id) =>
      quizzes.some((q) => q.id === id),
    );
    data.attempts = attempts;
    data.studyProgress = studyProgress;
    data.studySessions = studySessions;
    data.user.name = payload.user.name.slice(0, 80) || "Curious learner";
  });
}
