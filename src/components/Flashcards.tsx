import { useEffect, useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import {
  ArrowLeft,
  ArrowRight,
  Layers,
  RotateCcw,
  RotateCw,
  Pencil,
} from "lucide-react";
import { api, type Quiz } from "../lib/api";
import { Button } from "./ui/button";

export function Flashcards({
  quizId,
  onBack,
  onEdit,
}: {
  quizId: string;
  onBack: () => void;
  onEdit: () => void;
}) {
  const [quiz, setQuiz] = useState<Quiz | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [index, setIndex] = useState(0),
    [flipped, setFlipped] = useState(false),
    [motion, setMotion] = useState(0);
  const gesture = useRef<{ x: number; y: number } | null>(null),
    ignoreClickUntil = useRef(0);
  useEffect(() => {
    let canceled = false;
    api<Quiz>("/quizzes/" + quizId)
      .then((q) => {
        if (canceled) return;
        if (!q.questions)
          throw new Error("Flashcards are available for quizzes you create.");
        setQuiz(q);
      })
      .catch((e) => {
        if (!canceled) setError(e.message);
      })
      .finally(() => {
        if (!canceled) setLoading(false);
      });
    return () => {
      canceled = true;
    };
  }, [quizId]);
  const questions = quiz?.questions || [],
    question = questions[index];
  function move(direction: number) {
    const next = index + direction;
    if (next < 0 || next >= questions.length) return;
    setMotion(direction);
    setFlipped(false);
    setIndex(next);
  }
  const answer =
    question?.accepted.filter((value) => value.trim()).join(" / ") ||
    "No answer set yet. Add a correct or accepted answer in Edit quiz.";
  return (
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (!open) onBack();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="flashcards-backdrop" />
        <Dialog.Content
          className="flashcards-page"
          onKeyDown={(event) => {
            if (event.key === "ArrowLeft") {
              event.preventDefault();
              move(-1);
            }
            if (event.key === "ArrowRight") {
              event.preventDefault();
              move(1);
            }
          }}
        >
          <Dialog.Title className="sr-only">Flashcard study mode</Dialog.Title>
          <Dialog.Description className="sr-only">
            Tap the card to reveal its answer. Swipe left for the next question
            and right for the previous question. Press Escape to exit.
          </Dialog.Description>
          <button className="text-link" onClick={onBack}>
            <ArrowLeft size={16} /> Back to my quizzes
          </button>
          <div className="page-title">
            <div>
              <span className="eyebrow">
                A LITTLE REPETITION. A LOT OF DISCOVERY.
              </span>
              <h1>
                <Layers size={26} /> Flashcards
              </h1>
              <p>{quiz?.title || "Your study deck"}</p>
            </div>
            <Button variant="outline" onClick={onEdit}>
              <Pencil size={15} /> Edit quiz
            </Button>
          </div>
          {loading ? (
            <div className="panel empty-state" role="status">
              Opening your flashcards…
            </div>
          ) : error ? (
            <div className="alert" role="alert">
              {error}
            </div>
          ) : !question ? (
            <div className="panel empty-state">
              <Layers size={36} />
              <h2>Your deck is waiting</h2>
              <p>
                Add questions and correct answers to your quiz to create
                flashcards.
              </p>
              <Button onClick={onEdit}>
                <Pencil size={16} /> Add questions
              </Button>
            </div>
          ) : (
            <>
              <div className="flashcards-status">
                <span aria-live="polite" aria-atomic="true">
                  Card {index + 1} of {questions.length}
                </span>
                <span>Study mode · No score or timer</span>
              </div>
              <div className="progress-track">
                <div
                  style={{
                    width: `${((index + 1) / questions.length) * 100}%`,
                  }}
                />
              </div>
              <button
                className={`flashcard ${flipped ? "is-flipped" : ""}`}
                aria-label={
                  flipped
                    ? `Show question: ${question.prompt}`
                    : `Reveal answer: ${question.prompt || `Question ${index + 1}`}`
                }
                aria-pressed={flipped}
                onClick={(event) => {
                  if (
                    event.detail === 0 ||
                    Date.now() >= ignoreClickUntil.current
                  )
                    setFlipped((value) => !value);
                }}
                onPointerDown={(event) => {
                  ignoreClickUntil.current = 0;
                  gesture.current = { x: event.clientX, y: event.clientY };
                  event.currentTarget.setPointerCapture(event.pointerId);
                }}
                onPointerCancel={() => {
                  gesture.current = null;
                }}
                onPointerUp={(event) => {
                  const start = gesture.current;
                  gesture.current = null;
                  if (!start) return;
                  const dx = event.clientX - start.x,
                    dy = event.clientY - start.y;
                  if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.25) {
                    ignoreClickUntil.current = Date.now() + 350;
                    move(dx < 0 ? 1 : -1);
                  }
                }}
              >
                <span
                  className={`flashcard-inner ${motion > 0 ? "swipe-next" : motion < 0 ? "swipe-previous" : ""}`}
                  key={question.id}
                >
                  <span
                    className="flashcard-face flashcard-front"
                    aria-hidden={flipped}
                  >
                    <span className="eyebrow">QUESTION {index + 1}</span>
                    <span className="flashcard-text">
                      {question.prompt || "Add a question in Edit quiz."}
                    </span>
                    <span className="flashcard-flip-hint">
                      <RotateCw size={17} /> Tap to reveal the answer
                    </span>
                  </span>
                  <span
                    className="flashcard-face flashcard-back"
                    aria-hidden={!flipped}
                  >
                    <span className="eyebrow">THE ANSWER</span>
                    <span className="flashcard-text">{answer}</span>
                    {question.explanation && (
                      <span className="flashcard-explanation">
                        {question.explanation}
                      </span>
                    )}
                    <span className="flashcard-flip-hint">
                      <RotateCw size={17} /> Tap to see the question
                    </span>
                  </span>
                </span>
              </button>
              <div className="flashcard-controls">
                <Button
                  variant="outline"
                  disabled={index === 0}
                  onClick={() => move(-1)}
                >
                  <ArrowLeft size={16} /> Previous
                </Button>
                <Button
                  variant="ghost"
                  aria-label="Start again"
                  onClick={() => {
                    setIndex(0);
                    setFlipped(false);
                    setMotion(0);
                  }}
                >
                  <RotateCcw size={16} /> <span>Start again</span>
                </Button>
                <Button
                  disabled={index === questions.length - 1}
                  onClick={() => move(1)}
                >
                  Next card
                  <ArrowRight size={16} />
                </Button>
              </div>
              <p className="flashcards-help">
                Tap to flip. Swipe left for the next card, right for the
                previous card. You can also use Enter and the arrow keys.
              </p>
            </>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
