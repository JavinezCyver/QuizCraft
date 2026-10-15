import { matchesAnswer, hasDuplicateOptions } from "./questions";
import type { Quiz, User, History } from "./api";
import type { StudyProgress } from "./study-progress";

export const localUser: User = {
  id: "local",
  name: "Curious learner",
  email: "",
  avatar: "",
  admin: false,
};
const defaults = {
  guests: true,
  review: true,
  showAnswers: true,
  rankings: false,
  passing: 70,
  time: 0,
  randomQuestions: false,
  randomAnswers: false,
  layout: "single" as const,
};
type Attempt = {
  id: string;
  quiz: Quiz;
  questions: NonNullable<Quiz["questions"]>;
  started: number;
  deadline: number | null;
  answers: Record<string, string>;
  name: string;
  public: boolean;
  preview: boolean;
  result?: any;
};
export type OfflineData = {
  version: 1;
  user: User;
  quizzes: Quiz[];
  bookmarks: string[];
  attempts: Attempt[];
  studyProgress?: Record<string, StudyProgress>;
  studySessions?: History[];
};
const clone = <T>(value: T): T => structuredClone(value);
const shuffled = <T>(values: T[]) => {
  const copy = [...values];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
};
export function prepareQuiz(value: unknown): Quiz {
  if (!value || typeof value !== "object")
    throw new Error("Invalid quiz file.");
  const q = value as Quiz;
  if (
    typeof q.title !== "string" ||
    !Array.isArray(q.questions) ||
    q.questions.length > 500
  )
    throw new Error("Invalid quiz file.");
  const questions = q.questions.map((question) => {
    if (
      !question ||
      !["multiple", "boolean", "blank", "short"].includes(question.type) ||
      typeof question.prompt !== "string" ||
      !Array.isArray(question.options) ||
      !question.options.every((s) => typeof s === "string") ||
      !Array.isArray(question.accepted) ||
      !question.accepted.every((s) => typeof s === "string") ||
      !Number.isFinite(question.points) ||
      question.points <= 0 ||
      question.points > 1000
    )
      throw new Error("Invalid question in quiz file.");
    if (
      (question.correctOptions !== undefined &&
        (!Array.isArray(question.correctOptions) ||
          !question.correctOptions.every(
            (index) =>
              Number.isInteger(index) &&
              index >= 0 &&
              index < question.options.length,
          ))) ||
      (question.correctOption != null &&
        (!Number.isInteger(question.correctOption) ||
          question.correctOption < 0 ||
          question.correctOption >= question.options.length))
    )
      throw new Error("Invalid correct answer choices in quiz file.");
    return {
      ...question,
      id: crypto.randomUUID(),
      explanation: String(question.explanation || ""),
      questionImage: embeddedImage(question.questionImage),
      answerImage: embeddedImage(question.answerImage),
    };
  });
  return {
    id: crypto.randomUUID(),
    owner: localUser.id,
    creator: "You",
    title: q.title.slice(0, 200),
    description: String(q.description || ""),
    category: String(q.category || "Uncategorized"),
    difficulty: ["Easy", "Intermediate", "Advanced"].includes(q.difficulty)
      ? q.difficulty
      : "Easy",
    theme: ["purple", "space", "world", "nature", "history", "movies"].includes(
      q.theme,
    )
      ? q.theme
      : "purple",
    cover:
      typeof q.cover === "string" &&
      /^(data:image\/(png|jpeg|webp|gif);base64,|\/covers\/)/.test(q.cover)
        ? q.cover
        : "",
    status: q.status === "published" ? "published" : "draft",
    visibility: ["public", "unlisted", "private"].includes(q.visibility)
      ? q.visibility
      : "public",
    settings: {
      ...defaults,
      guests: true,
      review: q.settings?.review !== false,
      showAnswers: q.settings?.showAnswers !== false,
      rankings: q.settings?.rankings === true,
      randomQuestions: q.settings?.randomQuestions === true,
      randomAnswers: q.settings?.randomAnswers === true,
      layout: q.settings?.layout === "all" ? "all" : "single",
      time: Math.max(0, Math.min(180, Number(q.settings?.time) || 0)),
      passing: Math.max(
        0,
        Math.min(100, Number(q.settings?.passing ?? defaults.passing) || 0),
      ),
    },
    questions,
    questionCount: questions.length,
    created: new Date().toISOString(),
    plays: 0,
  };
}
function embeddedImage(value: unknown): string {
  return typeof value === "string" &&
    /^data:image\/(png|jpeg|webp|gif);base64,[a-zA-Z0-9+/=\r\n]+$/.test(value)
    ? value
    : "";
}
function initial(): OfflineData {
  return {
    version: 1,
    user: clone(localUser),
    quizzes: [],
    bookmarks: [],
    attempts: [],
  };
}
let database: Promise<IDBDatabase> | undefined;
function open() {
  return (database ??= new Promise((resolve, reject) => {
    const request = indexedDB.open("quizcraft-offline", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("data");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => {
      database = undefined;
      reject(
        new Error(
          "Local storage could not be opened. Allow site storage to use QuizCraft.",
        ),
      );
    };
  }));
}
// Each operation reads and writes in one transaction, including across browser tabs.
export async function withData<T>(
  action: (data: OfflineData) => T,
): Promise<T> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction("data", "readwrite");
    const store = transaction.objectStore("data");
    const request = store.get("library");
    let result: T;
    let error: unknown;
    request.onsuccess = () => {
      try {
        const data: OfflineData = request.result ?? initial();
        result = clone(action(data));
        store.put(data, "library");
      } catch (e) {
        error = e;
        transaction.abort();
      }
    };
    transaction.oncomplete = () => resolve(result);
    transaction.onabort = transaction.onerror = () =>
      reject(
        error ||
          new Error(
            "Changes could not be saved on this device. Check available storage.",
          ),
      );
  });
}
function recalculate(a: Attempt) {
  const r = a.result;
  r.score = r.responses.reduce(
    (sum: number, response: any) => sum + (response.earned ?? 0),
    0,
  );
  r.correct = r.responses.filter(
    (response: any) => response.earned === response.points,
  ).length;
  r.pending = r.responses.filter(
    (response: any) => response.earned === null,
  ).length;
}
function playCount(data: OfflineData, quiz: Quiz): number {
  const completed =
    data.attempts.filter(
      (attempt) =>
        attempt.quiz.id === quiz.id && attempt.result && !attempt.preview,
    ).length +
    (data.studySessions || []).filter((session) => session.quiz_id === quiz.id)
      .length;
  return Math.max(quiz.plays || 0, completed);
}
export function offlineRequest<T>(
  path: string,
  method: string,
  body: any = {},
): Promise<T> {
  return withData((data) => {
    const parts = path.split("/").filter(Boolean);
    const q = data.quizzes.find((quiz) => quiz.id === parts[1]);
    const attempt = data.attempts.find((a) => a.id === parts[1]);
    if (path === "/me") return data.user;
    if (path === "/profile" && method === "PATCH") {
      const name = String(body.name || "").trim();
      if (!name || name.length > 80)
        throw new Error("Enter a display name from 1 to 80 characters.");
      data.user.name = name;
      return data.user;
    }
    if (path === "/library")
      return {
        quizzes: data.quizzes.map((quiz) => ({
          ...quiz,
          plays: playCount(data, quiz),
        })),
        bookmarks: data.bookmarks,
        saved: data.quizzes
          .filter((q) => data.bookmarks.includes(q.id))
          .map((quiz) => ({ ...quiz, plays: playCount(data, quiz) })),
        attempts: [
          ...data.attempts
            .filter((a) => a.result && !a.preview)
            .sort((a, b) => b.result.submitted - a.result.submitted)
            .map((a) => ({
              ...a.result,
              quiz_id: a.quiz.id,
              title: a.quiz.title,
              name: a.name,
            })),
          ...(data.studySessions || []),
        ].sort((a, b) => b.submitted - a.submitted),
      };
    if (path === "/categories" && method === "DELETE") {
      data.quizzes.forEach((q) => {
        if (q.category === body.name) q.category = "Uncategorized";
      });
      return { ok: true };
    }
    if (parts[0] === "bookmarks" && method === "POST") {
      if (!q) throw new Error("Quiz not found.");
      data.bookmarks = data.bookmarks.filter((id) => id !== q.id);
      if (body.saved) data.bookmarks.push(q.id);
      return { ok: true };
    }
    if (path === "/grading") {
      if (method === "POST") {
        const a = data.attempts.find(
          (a) => a.id === body.attempt && !a.preview,
        );
        const response = a?.result?.responses.find(
          (r: any) => r.question_id === body.question,
        );
        if (
          !response ||
          !Number.isFinite(body.earned) ||
          body.earned < 0 ||
          body.earned > response.points
        )
          throw new Error("Enter valid points for this answer.");
        response.earned = body.earned;
        recalculate(a!);
        return { ok: true };
      }
      return data.attempts
        .filter((a) => a.result && !a.preview)
        .flatMap((a) =>
          a.result.responses
            .filter((r: any) => r.earned === null)
            .map((r: any) => ({ ...r, attempt_id: a.id, name: a.name })),
        );
    }
    if (path === "/quizzes" && method === "GET")
      return data.quizzes
        .filter((q) => q.status === "published" && q.visibility === "public")
        .map((quiz) => ({ ...quiz, plays: playCount(data, quiz) }));
    if (path === "/quizzes" && method === "POST") {
      const quiz = prepareQuiz({
        title: "Untitled quiz",
        questions: [],
        settings: defaults,
      });
      data.quizzes.push(quiz);
      return quiz;
    }
    if (parts[0] === "quizzes") {
      if (!q) throw new Error("Quiz not found on this device.");
      if (parts[2] === "leaderboard")
        return data.attempts
          .filter(
            (a) =>
              a.quiz.id === q.id &&
              a.result &&
              a.public &&
              !a.preview &&
              !a.result.pending,
          )
          .map((a) => ({
            name: a.name,
            ...a.result,
            elapsed: a.result.submitted - a.started,
          }))
          .sort(
            (a, b) =>
              b.score / b.maximum - a.score / a.maximum ||
              a.elapsed - b.elapsed,
          );
      if (parts[2] === "duplicate" && method === "POST") {
        const copy = prepareQuiz({
          ...q,
          title: q.title + " (copy)",
          status: "draft",
        });
        data.quizzes.push(copy);
        return copy;
      }
      if (parts[2] === "start" && method === "POST") {
        if (!q.questions?.length)
          throw new Error("Add questions before starting this quiz.");
        const snapshot = clone(q);
        snapshot.preview = !!body.preview || q.status === "draft";
        const questions = snapshot.settings.randomQuestions
          ? shuffled(snapshot.questions!)
          : snapshot.questions!;
        if (snapshot.settings.randomAnswers)
          questions.forEach((question) => {
            question.options = shuffled(question.options);
          });
        const started = Date.now();
        const a: Attempt = {
          id: crypto.randomUUID(),
          quiz: snapshot,
          questions,
          started,
          deadline: snapshot.settings.time
            ? started + snapshot.settings.time * 60000
            : null,
          answers: {},
          name: String(body.name || data.user.name).slice(0, 80),
          public: !!body.public,
          preview: !!body.preview || q.status === "draft",
        };
        data.attempts.push(a);
        return a;
      }
      if (method === "DELETE") {
        if (data.studyProgress) delete data.studyProgress[q.id];
        data.studySessions = data.studySessions?.filter(
          (session) => session.quiz_id !== q.id,
        );
        data.quizzes = data.quizzes.filter((quiz) => quiz.id !== q.id);
        data.bookmarks = data.bookmarks.filter((id) => id !== q.id);
        data.attempts = data.attempts.filter((a) => a.quiz.id !== q.id);
        return { ok: true };
      }
      if (method === "PUT") {
        const updated = prepareQuiz(body);
        updated.id = q.id;
        updated.created = q.created;
        updated.plays = playCount(data, q);
        updated.visibility = ["private", "unlisted", "public"].includes(
          body.visibility,
        )
          ? body.visibility
          : "public";
        // Stable question identifiers are needed for autosaves and navigation.
        updated.questions!.forEach((question, i) => {
          question.id = body.questions[i].id || question.id;
        });
        if (
          updated.status === "published" &&
          updated.questions!.some(
            (question) =>
              ["multiple", "boolean"].includes(question.type) &&
              hasDuplicateOptions(question),
          )
        )
          throw new Error(
            "Answer choices must be different. Rename or remove duplicate choices before publishing.",
          );
        if (
          updated.status === "published" &&
          (!updated.questions!.length ||
            updated.questions!.some(
              (question) =>
                !question.prompt.trim() ||
                (question.type !== "short" &&
                  !question.accepted.some((answer) => answer.trim())) ||
                (["multiple", "boolean"].includes(question.type) &&
                  (question.options.length < 2 ||
                    question.options.some((s) => !s.trim()) ||
                    !question.accepted.every((answer) =>
                      question.options.includes(answer),
                    ))),
            ))
        )
          throw new Error(
            "Complete every question and its correct answer before making the quiz ready.",
          );
        Object.assign(q, updated);
        return q;
      }
      return {
        ...q,
        plays: playCount(data, q),
      };
    }
    if (parts[0] === "attempts") {
      if (!attempt) throw new Error("Attempt not found.");
      if (parts[2] === "answers" && method === "PUT") {
        if (
          !attempt.result &&
          (!attempt.deadline || Date.now() < attempt.deadline)
        )
          attempt.answers = clone(body.answers || {});
        return { ok: true };
      }
      if (parts[2] === "submit" && method === "POST") {
        if (attempt.result)
          return {
            ...attempt.result,
            responses: attempt.quiz.settings.showAnswers
              ? attempt.result.responses
              : [],
          };
        const expired =
          attempt.deadline !== null && Date.now() >= attempt.deadline;
        const answers = expired
          ? attempt.answers
          : body.answers || attempt.answers;
        if (
          !expired &&
          attempt.questions.some((q) => !String(answers[q.id] || "").trim())
        )
          throw new Error("Answer every question before submitting the quiz.");
        attempt.answers = clone(answers);
        attempt.result = {
          id: attempt.id,
          quiz: attempt.quiz,
          started: attempt.started,
          submitted: Date.now(),
          total: attempt.questions.length,
          maximum: attempt.questions.reduce((sum, q) => sum + q.points, 0),
          responses: attempt.questions.map((q) => {
            const answer = String(answers[q.id] || "");
            const earned =
              q.type === "short" && !q.accepted.length
                ? null
                : matchesAnswer(q, answer)
                  ? q.points
                  : 0;
            return {
              question_id: q.id,
              answer,
              earned,
              prompt: q.prompt,
              accepted: q.accepted,
              explanation: q.explanation,
              points: q.points,
            };
          }),
        };
        recalculate(attempt);
        if (!attempt.preview) {
          const quiz = data.quizzes.find((q) => q.id === attempt.quiz.id);
          if (quiz) quiz.plays = (quiz.plays || 0) + 1;
        }
        return {
          ...attempt.result,
          responses: attempt.quiz.settings.showAnswers
            ? attempt.result.responses
            : [],
        };
      }
    }
    throw new Error("This action is unavailable offline.");
  }) as Promise<T>;
}
