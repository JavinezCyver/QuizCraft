import { prepareQuiz, withData, type OfflineData } from "./offline";
import type { Quiz } from "./api";

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
  const quizzes = payload.quizzes.map((q) => ({
    ...prepareQuiz(q),
    id: String(q.id),
  }));
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
    data.user.name = payload.user.name.slice(0, 80) || "Curious learner";
  });
}
