import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Clock,
  Flag,
  RotateCcw,
  Share2,
  Trophy,
  X,
} from "lucide-react";
import { Button } from "./ui/button";
import { api, share, type Quiz, type Question } from "../lib/api";
type Attempt = {
  id: string;
  quiz: Quiz;
  questions: Question[];
  started: number;
  deadline: number | null;
};
type Result = {
  id: string;
  quiz: Quiz;
  score: number;
  maximum: number;
  correct: number;
  total: number;
  pending: number;
  started: number;
  submitted: number;
  responses: {
    question_id: string;
    answer: string;
    earned: number | null;
    prompt: string;
    accepted: string[];
    explanation: string;
    points: number;
  }[];
};
export function Player({
  quiz,
  onBack,
  backLabel = "Back to quiz library",
  onDone,
  notify,
}: {
  quiz: Quiz;
  onBack: () => void;
  backLabel?: string;
  onDone: () => void;
  notify: (s: string) => void;
}) {
  const [name, setName] = useState(""),
    [rank, setRank] = useState(false),
    [attempt, setAttempt] = useState<Attempt | null>(null),
    [answers, setAnswers] = useState<Record<string, string>>({}),
    [index, setIndex] = useState(0),
    [review, setReview] = useState(false),
    [result, setResult] = useState<Result | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [now, setNow] = useState(Date.now()),
    [leaders, setLeaders] = useState<any[]>([]);
  const submitted = useRef(false),
    answersRef = useRef(answers);
  answersRef.current = answers;
  const displayQuiz = result?.quiz || attempt?.quiz || quiz;
  useEffect(() => {
    api("/quizzes/" + quiz.id + "/leaderboard")
      .then(setLeaders)
      .catch(() => {});
  }, [quiz.id, result]);
  useEffect(() => {
    if (!attempt || result) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [attempt, result]);
  useEffect(() => {
    if (
      attempt?.deadline &&
      now >= attempt.deadline &&
      !result &&
      !submitted.current
    )
      void submit();
  }, [now, attempt, result]);
  useEffect(() => {
    if (!attempt || result || !Object.keys(answers).length) return;
    api("/attempts/" + attempt.id + "/answers", "PUT", { answers }).catch(
      (e) => {
        if (!attempt.deadline || Date.now() < attempt.deadline)
          setError(
            "Your answer could not be saved. Check your connection. " +
              e.message,
          );
      },
    );
  }, [answers, attempt, result]);
  async function start() {
    setBusy(true);
    setError("");
    try {
      const a = await api<Attempt>("/quizzes/" + quiz.id + "/start", "POST", {
        name,
        public: rank,
        preview: !!quiz.preview,
      });
      setAttempt(a);
      setResult(null);
      setAnswers({});
      setIndex(0);
      setReview(false);
      setNow(Date.now());
      submitted.current = false;
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function submit() {
    if (!attempt || submitted.current) return;
    submitted.current = true;
    setBusy(true);
    try {
      const r = await api<Result>(
        "/attempts/" + attempt.id + "/submit",
        "POST",
        { answers: answersRef.current },
      );
      setResult(r);
      onDone();
    } catch (e) {
      setError((e as Error).message);
      submitted.current = false;
    } finally {
      setBusy(false);
    }
  }
  const count = Object.values(answers).filter((a) => a.trim()).length;
  const seconds = attempt?.deadline
    ? Math.max(0, Math.ceil((attempt.deadline - now) / 1000))
    : 0;
  const questionView = (q: Question, i: number) => (
    <section className="question-take panel" key={q.id}>
      <span className="eyebrow">
        QUESTION {i + 1} <span>· {q.points} points</span>
      </span>
      <h2>{q.prompt}</h2>
      <p>
        {["multiple", "boolean"].includes(q.type)
          ? "Select one answer below."
          : "Type your answer below."}
      </p>
      {["multiple", "boolean"].includes(q.type) ? (
        <div className="answer-options">
          {q.options.map((option, n) => (
            <button
              className={answers[q.id] === option ? "selected" : ""}
              key={n}
              onClick={() => setAnswers((a) => ({ ...a, [q.id]: option }))}
            >
              <span>{String.fromCharCode(65 + n)}</span>
              {option}
              {answers[q.id] === option && <Check size={18} />}
            </button>
          ))}
        </div>
      ) : (
        <label>
          Your answer
          <textarea
            value={answers[q.id] || ""}
            onChange={(e) =>
              setAnswers((a) => ({ ...a, [q.id]: e.target.value }))
            }
            placeholder="Your answer…"
          />
        </label>
      )}
    </section>
  );
  return (
    <div className="player">
      <button className="text-link" onClick={onBack}>
        <ArrowLeft size={16} /> {backLabel}
      </button>
      {(displayQuiz.preview || displayQuiz.status === "draft") && (
        <p className="preview-notice">
          Quiz preview — this attempt won’t appear in your history or
          leaderboard.
        </p>
      )}
      {error && (
        <div className="alert" role="alert">
          {error}
        </div>
      )}
      {result ? (
        <>
          <div className="result-summary panel">
            <div className="result-trophy">
              <Trophy size={36} />
            </div>
            <span className="eyebrow">CURIOSITY LOOKS GOOD ON YOU</span>
            <h1>
              {result.pending
                ? "Your answers are in!"
                : (result.score / result.maximum) * 100 >=
                    displayQuiz.settings.passing
                  ? "Nicely done!"
                  : "Every question is a chance to learn."}
            </h1>
            <p>You’ve completed {quiz.title}</p>
            <div
              className="score-circle"
              style={
                {
                  "--score": `${(result.score / result.maximum) * 100}%`,
                } as React.CSSProperties
              }
            >
              <div>
                <strong>
                  {Math.round((result.score / result.maximum) * 100)}
                  <small>%</small>
                </strong>
                <span>
                  {result.pending
                    ? "Provisional score"
                    : (result.score / result.maximum) * 100 >=
                        displayQuiz.settings.passing
                      ? "Passed"
                      : "Keep exploring"}
                </span>
              </div>
            </div>
            <div className="result-stats">
              <div>
                <b>
                  {result.score}/{result.maximum}
                </b>
                <span>Total points</span>
              </div>
              <div>
                <b>{result.correct}</b>
                <span>Correct</span>
              </div>
              <div>
                <b>{result.total - result.correct - result.pending}</b>
                <span>Incorrect</span>
              </div>
              <div>
                <b>{Math.round((result.submitted - result.started) / 1000)}s</b>
                <span>Time taken</span>
              </div>
            </div>
            {result.pending > 0 && (
              <p>
                {result.pending} short answer(s) await the creator’s review.
                Your final score will appear in your history.
              </p>
            )}
            <div className="button-row">
              <Button onClick={start} disabled={busy}>
                <RotateCcw size={16} /> Try again
              </Button>
              <Button
                variant="outline"
                onClick={() =>
                  navigator.clipboard
                    .writeText(
                      `I scored ${Math.round((result.score / result.maximum) * 100)}% on ${quiz.title}! Try it: ${share(quiz.id)}`,
                    )
                    .then(() => notify("Result copied to clipboard."))
                    .catch(() =>
                      notify(
                        "Copy failed. Please use your browser’s share menu.",
                      ),
                    )
                }
              >
                <Share2 size={16} /> Share result
              </Button>
            </div>
          </div>
          {result.responses.length > 0 && (
            <section className="panel result-review">
              <h2>A little reflection goes a long way</h2>
              {result.responses.map((r, i) => (
                <div className="review-answer" key={r.question_id}>
                  <span
                    className={
                      r.earned === null
                        ? "pending"
                        : r.earned > 0
                          ? "correct"
                          : "incorrect"
                    }
                  >
                    {r.earned === null ? (
                      <Clock size={17} />
                    ) : r.earned > 0 ? (
                      <Check size={17} />
                    ) : (
                      <X size={17} />
                    )}
                  </span>
                  <div>
                    <h3>
                      {i + 1}. {r.prompt}
                    </h3>
                    <p>Your answer: {r.answer || "No answer"}</p>
                    <p>
                      {r.earned === null
                        ? "Awaiting manual grading"
                        : `Correct answer: ${r.accepted.join(" / ")}`}
                    </p>
                    <small>{r.explanation}</small>
                  </div>
                </div>
              ))}
            </section>
          )}
        </>
      ) : !attempt ? (
        <section className="quiz-intro panel">
          <div
            className={`intro-cover cover-${quiz.theme}`}
            style={quiz.cover ? { backgroundImage: `url(${quiz.cover})` } : {}}
          >
            <span className="pill">{quiz.category}</span>
          </div>
          <div className="intro-body">
            <div className="tag-row">
              <span className="difficulty">{quiz.difficulty}</span>
              {!!quiz.demo && <span className="demo-tag">Demo quiz</span>}
            </div>
            <h1>{quiz.title}</h1>
            <p>{quiz.description}</p>
            <div className="intro-facts">
              <span>
                <Flag size={17} />
                {quiz.questionCount} questions
              </span>
              <span>
                <Clock size={17} />
                {displayQuiz.settings.time
                  ? `${displayQuiz.settings.time} minutes`
                  : "At your own pace"}
              </span>
              <span>
                <Trophy size={17} />
                {displayQuiz.settings.passing}% to pass
              </span>
            </div>
            <div className="instructions">
              <h3>Before you begin</h3>
              <p>
                Choose your answers and{" "}
                {displayQuiz.settings.review
                  ? "review them before submitting"
                  : "submit when you finish"}
                .{" "}
                {displayQuiz.settings.time
                  ? "The timer starts when you begin and submits your answers when time runs out."
                  : "There’s no timer, so take your time."}{" "}
                Short answers without accepted answers are reviewed by the
                creator.
              </p>
            </div>
            <label>
              Your name (optional)
              <input
                value={name}
                maxLength={80}
                onChange={(e) => setName(e.target.value)}
                placeholder="Curious learner"
              />
            </label>
            {displayQuiz.settings.rankings &&
              !displayQuiz.preview &&
              displayQuiz.status !== "draft" && (
                <label className="check-label">
                  <input
                    type="checkbox"
                    checked={rank}
                    onChange={(e) => setRank(e.target.checked)}
                  />{" "}
                  Show my name and score on the public leaderboard
                </label>
              )}
            <Button onClick={start} disabled={busy}>
              {busy ? "Getting ready…" : "Let’s get started"}
              <ArrowRight size={17} />
            </Button>
          </div>
        </section>
      ) : (
        <>
          <div className="attempt-header">
            <div>
              <span className="eyebrow">
                LET’S PUT YOUR KNOWLEDGE TO THE TEST
              </span>
              <h1>{quiz.title}</h1>
            </div>
            {attempt.deadline && (
              <div
                className={`timer ${seconds < 30 ? "urgent" : ""}`}
                aria-live={seconds < 10 ? "polite" : "off"}
              >
                <Clock size={18} />
                {Math.floor(seconds / 60)}:
                {String(seconds % 60).padStart(2, "0")}
              </div>
            )}
          </div>
          <div className="progress-label">
            <span>
              {count} of {attempt.questions.length} answered
            </span>
            <b>{Math.round((count / attempt.questions.length) * 100)}%</b>
          </div>
          <div className="progress-track">
            <div
              style={{ width: `${(count / attempt.questions.length) * 100}%` }}
            />
          </div>
          {review ? (
            <section className="panel">
              <h2>Ready to wrap up?</h2>
              <p>
                {count === attempt.questions.length
                  ? "You’ve answered every question. Take one last look."
                  : `${attempt.questions.length - count} question(s) are unanswered. You can go back and complete them.`}
              </p>
              {attempt.questions.map((q, i) => (
                <button
                  className="review-line"
                  key={q.id}
                  onClick={() => {
                    setReview(false);
                    setIndex(i);
                  }}
                >
                  <span>
                    {i + 1}. {q.prompt}
                  </span>
                  <b>{answers[q.id] || "Unanswered"}</b>
                  <ArrowRight size={16} />
                </button>
              ))}
              <div className="review-actions">
                <Button disabled={busy} onClick={submit}>
                  {busy ? "Submitting…" : "Submit quiz"}
                  <Check size={16} />
                </Button>
              </div>
            </section>
          ) : (
            <>
              {displayQuiz.settings.layout === "all"
                ? attempt.questions.map(questionView)
                : questionView(attempt.questions[index], index)}
              <div className="player-controls">
                <Button
                  variant="outline"
                  disabled={
                    index === 0 || displayQuiz.settings.layout === "all"
                  }
                  onClick={() => setIndex((i) => i - 1)}
                >
                  <ArrowLeft size={16} /> Previous
                </Button>
                <div className="question-dots">
                  {attempt.questions.map((q, i) => (
                    <button
                      key={q.id}
                      aria-label={`Go to question ${i + 1}`}
                      className={`${i === index ? "active" : ""} ${answers[q.id] ? "answered" : ""}`}
                      onClick={() => setIndex(i)}
                    >
                      {i + 1}
                    </button>
                  ))}
                </div>
                {index < attempt.questions.length - 1 &&
                displayQuiz.settings.layout !== "all" ? (
                  <Button onClick={() => setIndex((i) => i + 1)}>
                    Next question
                    <ArrowRight size={16} />
                  </Button>
                ) : (
                  <Button
                    disabled={busy}
                    onClick={() =>
                      displayQuiz.settings.review ? setReview(true) : submit()
                    }
                  >
                    {displayQuiz.settings.review
                      ? "Review answers"
                      : "Submit quiz"}
                    <Check size={16} />
                  </Button>
                )}
              </div>
            </>
          )}
        </>
      )}
      {(!attempt || result) &&
        displayQuiz.settings.rankings &&
        !displayQuiz.preview &&
        displayQuiz.status !== "draft" && (
          <section className="panel leaderboard">
            <h2>
              <Trophy size={21} /> The curious minds leaderboard
            </h2>
            {leaders.length ? (
              leaders.map((l, i) => (
                <div className="leader-row" key={i}>
                  <b>#{i + 1}</b>
                  <span>{l.name}</span>
                  <strong>{Math.round((l.score / l.maximum) * 100)}%</strong>
                  <small>{Math.round(l.elapsed / 1000)}s</small>
                </div>
              ))
            ) : (
              <p>No public scores yet. Be the first to set the pace.</p>
            )}
          </section>
        )}
    </div>
  );
}
