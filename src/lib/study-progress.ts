import type { Quiz, History } from "./api";
import type { ReviewRating } from "./review";
import { withData } from "./offline";
import {
  matchesAnswer,
  matchesSelectedOptions,
  optionIndices,
  reorderOptions,
  correctIndices,
} from "./questions";

export type StudyProgress = {
  sessionId?: string;
  started?: number;
  signature: string;
  questionOrder: string[];
  optionOrder: Record<string, string[]>;
  optionIndices?: Record<string, number[]>;
  sequence: string[];
  index: number;
  ratings: Record<string, ReviewRating>;
  reviewFilter: "all" | ReviewRating;
  selections: Record<string, number[]>;
  typedAnswers: Record<string, string>;
  complete: boolean;
  showRequired: boolean;
  deadline: number | null;
};

async function fingerprint(value: unknown) {
  // Keep image data out of the progress record while still detecting edits.
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(JSON.stringify(value)),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

export function studySignature(quiz: Quiz) {
  return fingerprint([
    quiz.questions?.map((card) => [
      card.id,
      card.type,
      card.prompt,
      card.options,
      card.accepted,
      correctIndices(card),
      card.explanation || "",
      card.questionImage || "",
      card.answerImage || "",
      card.points,
    ]),
    [
      quiz.settings.showAnswers !== false,
      quiz.settings.time || 0,
      !!quiz.settings.randomQuestions,
      !!quiz.settings.randomAnswers,
    ],
  ]);
}

export function legacyStudySignature(quiz: Quiz) {
  return fingerprint([quiz.questions, quiz.settings]);
}

export function validStudyProgress(
  quiz: Quiz,
  value: unknown,
): value is StudyProgress {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const p = value as StudyProgress;
  const cards = quiz.questions || [];
  const ids = new Set(cards.map((card) => card.id));
  const record = (object: unknown): object is Record<string, unknown> =>
    !!object && typeof object === "object" && !Array.isArray(object);
  const validKeys = (object: unknown) =>
    record(object) && Object.keys(object).every((id) => ids.has(id));
  if (
    typeof p.signature !== "string" ||
    !Array.isArray(p.questionOrder) ||
    p.questionOrder.length !== cards.length ||
    new Set(p.questionOrder).size !== ids.size ||
    !p.questionOrder.every((id) => ids.has(id)) ||
    !Array.isArray(p.sequence) ||
    p.sequence.length > 10000 ||
    !p.sequence.every((id) => ids.has(id)) ||
    !Number.isInteger(p.index) ||
    p.index < 0 ||
    p.index >= Math.max(1, p.sequence.length) ||
    !["all", "bad", "good", "satisfied"].includes(p.reviewFilter) ||
    typeof p.complete !== "boolean" ||
    typeof p.showRequired !== "boolean" ||
    !(p.deadline === null || Number.isFinite(p.deadline)) ||
    (p.sessionId !== undefined &&
      (typeof p.sessionId !== "string" || !p.sessionId)) ||
    (p.started !== undefined && !Number.isFinite(p.started)) ||
    !validKeys(p.ratings) ||
    !Object.values(p.ratings).every((rating) =>
      ["bad", "good", "satisfied"].includes(rating),
    ) ||
    !validKeys(p.typedAnswers) ||
    !Object.values(p.typedAnswers).every(
      (answer) => typeof answer === "string",
    ) ||
    !validKeys(p.selections) ||
    !validKeys(p.optionOrder) ||
    (p.optionIndices !== undefined && !validKeys(p.optionIndices))
  )
    return false;
  return cards.every((card) => {
    const options = p.optionOrder[card.id];
    if (
      !Array.isArray(options) ||
      options.length !== card.options.length ||
      !options.every((option) => typeof option === "string") ||
      JSON.stringify([...options].sort()) !==
        JSON.stringify([...card.options].sort())
    )
      return false;
    const selected = p.selections[card.id] ?? [];
    if (p.optionIndices !== undefined) {
      const order = p.optionIndices[card.id];
      if (
        !Array.isArray(order) ||
        order.length !== card.options.length ||
        new Set(order).size !== card.options.length ||
        !order.every(
          (original, index) =>
            Number.isInteger(original) &&
            original >= 0 &&
            original < card.options.length &&
            card.options[original] === options[index],
        )
      )
        return false;
    }
    if (
      !Array.isArray(selected) ||
      !selected.every(
        (index) =>
          Number.isInteger(index) && index >= 0 && index < options.length,
      ) ||
      (card.type === "boolean" && selected.length > 1)
    )
      return false;
    const answered = ["multiple", "boolean"].includes(card.type)
      ? selected.length > 0
      : !!p.typedAnswers[card.id]?.trim();
    return !p.complete || (answered && p.ratings[card.id] === "satisfied");
  });
}

export async function loadStudyProgress(quiz: Quiz) {
  const [signature, legacy] = await Promise.all([
    studySignature(quiz),
    legacyStudySignature(quiz),
  ]);
  return withData((data) => {
    const saved = data.studyProgress?.[quiz.id];
    // Editing questions or settings starts a fresh session with the updated deck.
    // Also accept the signature format used before pictures were supported.
    const matches =
      saved &&
      (saved.signature === signature ||
        saved.signature === legacy ||
        saved.signature === JSON.stringify([quiz.questions, quiz.settings]));
    return {
      signature,
      progress: matches && validStudyProgress(quiz, saved) ? saved : null,
    };
  });
}

export function recordStudyCompletion(quiz: Quiz, progress: StudyProgress) {
  if (quiz.preview) return Promise.resolve();
  if (
    !progress.complete ||
    !progress.sessionId ||
    !progress.started ||
    !validStudyProgress(quiz, progress)
  )
    return Promise.reject(
      new Error("Answer every card and choose SATISFIED before finishing."),
    );
  const cards = quiz.questions || [];
  const correct = cards.filter((card) => {
    if (["multiple", "boolean"].includes(card.type)) {
      const order =
        progress.optionIndices?.[card.id] ??
        optionIndices(card, progress.optionOrder[card.id]);
      return matchesSelectedOptions(
        reorderOptions(card, order),
        progress.selections[card.id] || [],
      );
    }
    return matchesAnswer(card, progress.typedAnswers[card.id] || "");
  });
  const entry: History = {
    id: progress.sessionId,
    kind: "flashcards",
    quiz_id: quiz.id,
    title: quiz.title,
    name: "",
    started: progress.started,
    submitted: Date.now(),
    score: correct.reduce((sum, card) => sum + card.points, 0),
    maximum: cards.reduce((sum, card) => sum + card.points, 0),
    correct: correct.length,
    pending: 0,
  };
  return withData((data) => {
    const storedQuiz = data.quizzes.find((card) => card.id === quiz.id);
    if (!storedQuiz) throw new Error("This quiz is no longer on this device.");
    data.studySessions ??= [];
    if (!data.studySessions.some((session) => session.id === entry.id)) {
      data.studySessions.push({ ...entry, name: data.user.name });
      storedQuiz.plays = (storedQuiz.plays || 0) + 1;
    }
    data.studyProgress ??= {};
    data.studyProgress[quiz.id] = progress;
  });
}

export function saveStudyProgress(quizId: string, progress: StudyProgress) {
  return withData((data) => {
    if (!data.quizzes.some((quiz) => quiz.id === quizId)) return;
    data.studyProgress ??= {};
    data.studyProgress[quizId] = progress;
  });
}
