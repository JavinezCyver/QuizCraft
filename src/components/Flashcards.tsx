import {
  Fragment,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import * as Dialog from "@radix-ui/react-dialog";
import {
  ArrowLeft,
  ArrowRight,
  Layers,
  RotateCcw,
  RotateCw,
  Pencil,
} from "lucide-react";
import { api, type Quiz, type Question } from "../lib/api";
import { Button } from "./ui/button";
import { Select } from "./ui/select";
import { FormattedQuestion } from "./FormattedQuestion";
import { FlashcardFace } from "./FlashcardFace";
import { plainQuestionText } from "../lib/question-format";
import { highlightAnswer } from "../lib/answer-highlight";
import { pendingReviewIds, type ReviewRating } from "../lib/review";
import {
  allowsMultipleSelections,
  correctIndices,
  hasCompleteAnswer,
  optionIndices,
  reorderOptions,
} from "../lib/questions";
import {
  loadStudyProgress,
  saveStudyProgress,
  recordStudyCompletion,
  type StudyProgress,
} from "../lib/study-progress";

const reviewRatings: {
  value: ReviewRating;
  emoji: string;
  label: string;
  hint: string;
}[] = [
  {
    value: "unrated",
    emoji: "\u{1F610}",
    label: "UNRATED",
    hint: "Not rated yet; review after this pass",
  },
  {
    value: "bad",
    emoji: "\u{1F620}",
    label: "BAD",
    hint: "Review again after this pass",
  },
  {
    value: "good",
    emoji: "\u{1F642}",
    label: "GOOD",
    hint: "Review again after this pass",
  },
  {
    value: "satisfied",
    emoji: "\u{1F60A}",
    label: "SATISFIED",
    hint: "No more repeats this session",
  },
];
const reviewColors: Record<ReviewRating, string> = {
  unrated: "#f4d6d9",
  bad: "#ef4444",
  good: "#3b82f6",
  satisfied: "#22c55e",
};

function shuffled<T>(values: T[]): T[] {
  const copy = [...values];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}
function studyDeck(quiz: Quiz) {
  const questions = quiz.settings.randomQuestions
    ? shuffled(quiz.questions || [])
    : [...(quiz.questions || [])];
  const orders: Record<string, number[]> = {};
  const deck = {
    ...quiz,
    questions: questions.map((question) => {
      const indices = question.options.map((_, index) => index);
      orders[question.id] =
        quiz.settings.randomAnswers && question.type === "multiple"
          ? shuffled(indices)
          : indices;
      return reorderOptions(question, orders[question.id]);
    }),
  };
  return { deck, orders };
}

export function Flashcards({
  quizId,
  previewQuiz,
  onBack,
  backLabel,
  onEdit,
}: {
  quizId: string;
  previewQuiz?: Quiz;
  onBack: () => void;
  backLabel: string;
  onEdit: () => void;
}) {
  const [quiz, setQuiz] = useState<Quiz | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [saveError, setSaveError] = useState(""),
    [index, setIndex] = useState(0),
    [complete, setComplete] = useState(false),
    [finishing, setFinishing] = useState(false),
    [sequence, setSequence] = useState<string[]>([]),
    [ratings, setRatings] = useState<Record<string, ReviewRating>>({}),
    [reviewFilter, setReviewFilter] = useState<"all" | ReviewRating>("all"),
    [flipped, setFlipped] = useState(false),
    [motion, setMotion] = useState(0),
    [celebration, setCelebration] = useState<string | null>(null),
    [selections, setSelections] = useState<Record<string, number[]>>({}),
    [typedAnswers, setTypedAnswers] = useState<Record<string, string>>({}),
    [showRequired, setShowRequired] = useState(false),
    [deadline, setDeadline] = useState<number | null>(null),
    [now, setNow] = useState(Date.now());
  const sourceQuiz = useRef<Quiz | null>(null);
  const sourceOptions = useRef<Record<string, number[]>>({});
  const sourceSignature = useRef("");
  const sessionIdentity = useRef({ id: "", started: 0 });
  const expired = !complete && deadline !== null && now >= deadline;
  const canReveal = quiz?.settings.showAnswers !== false && !expired;
  useEffect(() => {
    if (!celebration) return;
    const timer = window.setTimeout(() => setCelebration(null), 1000);
    return () => window.clearTimeout(timer);
  }, [celebration]);
  function restart() {
    if (!sourceQuiz.current || finishing) return;
    setCelebration(null);
    const { deck, orders } = studyDeck(sourceQuiz.current);
    sourceOptions.current = orders;
    setQuiz(deck);
    setSequence(deck.questions!.map((question) => question.id));
    setRatings({});
    setReviewFilter("all");
    setComplete(false);
    setSelections({});
    setTypedAnswers({});
    setShowRequired(false);
    setIndex(0);
    setFlipped(false);
    setMotion(0);
    const started = Date.now();
    sessionIdentity.current = { id: crypto.randomUUID(), started };
    setNow(started);
    setDeadline(
      sourceQuiz.current.settings.time
        ? started + sourceQuiz.current.settings.time * 60000
        : null,
    );
  }
  useEffect(() => {
    if (deadline === null || expired || complete) return;
    const timer = setTimeout(
      () => setNow(Date.now()),
      Math.max(1, Math.min(1000, deadline - Date.now())),
    );
    return () => clearTimeout(timer);
  }, [deadline, expired, complete, now]);
  const gesture = useRef<{ x: number; y: number } | null>(null),
    ignoreClickUntil = useRef(0);
  useEffect(() => {
    let canceled = false;
    (previewQuiz
      ? Promise.resolve(previewQuiz)
      : api<Quiz>("/quizzes/" + quizId)
    )
      .then(async (q) => {
        if (canceled) return;
        if (!q.questions)
          throw new Error("Flashcards are available for quizzes you create.");
        const { signature, progress: saved } = previewQuiz
          ? { signature: "", progress: null }
          : await loadStudyProgress(q);
        if (canceled) return;
        sourceQuiz.current = q;
        sourceSignature.current = signature;
        sessionIdentity.current = {
          id: saved?.sessionId || crypto.randomUUID(),
          started: saved?.started || Date.now(),
        };
        const prepared = studyDeck(q);
        sourceOptions.current = prepared.orders;
        const deck = saved
          ? {
              ...q,
              questions: saved.questionOrder.map((id) => {
                const card = q.questions!.find((card) => card.id === id)!;
                const order =
                  saved.optionIndices?.[id] ??
                  optionIndices(card, saved.optionOrder[id]);
                sourceOptions.current[id] = order;
                return reorderOptions(card, order);
              }),
            }
          : prepared.deck;
        setQuiz(deck);
        setSequence(
          saved?.sequence ?? deck.questions!.map((question) => question.id),
        );
        setRatings(saved?.ratings ?? {});
        setReviewFilter(saved?.reviewFilter ?? "all");
        setComplete(saved?.complete ?? false);
        setIndex(saved?.index ?? 0);
        setFlipped(false);
        setSelections(
          Object.fromEntries(
            Object.entries(saved?.selections ?? {}).map(([id, selected]) => {
              const card = deck.questions.find((card) => card.id === id)!;
              return [
                id,
                allowsMultipleSelections(card) ? selected : selected.slice(-1),
              ];
            }),
          ),
        );
        setTypedAnswers(saved?.typedAnswers ?? {});
        setShowRequired(saved?.showRequired ?? false);
        const started = Date.now();
        setNow(started);
        setDeadline(
          saved
            ? saved.deadline
            : q.settings.time
              ? started + q.settings.time * 60000
              : null,
        );
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
  }, [quizId, previewQuiz]);
  function progressSnapshot(isComplete = complete): StudyProgress {
    return {
      signature: sourceSignature.current,
      sessionId: sessionIdentity.current.id,
      started: sessionIdentity.current.started,
      questionOrder: quiz!.questions!.map((card) => card.id),
      optionOrder: Object.fromEntries(
        quiz!.questions!.map((card) => [card.id, card.options]),
      ),
      optionIndices: sourceOptions.current,
      sequence,
      index,
      ratings,
      reviewFilter,
      selections,
      typedAnswers,
      complete: isComplete,
      showRequired,
      deadline,
    };
  }
  useLayoutEffect(() => {
    if (previewQuiz || loading || error || !quiz || !sourceQuiz.current) return;
    let active = true;
    void saveStudyProgress(quiz.id, progressSnapshot())
      .then(() => {
        if (active) setSaveError("");
      })
      .catch(() => {
        if (active)
          setSaveError(
            "Study progress could not be saved on this device. Check available storage.",
          );
      });
    return () => {
      active = false;
    };
  }, [
    quiz,
    loading,
    error,
    sequence,
    index,
    ratings,
    reviewFilter,
    selections,
    typedAnswers,
    complete,
    showRequired,
    deadline,
    previewQuiz,
  ]);
  const allQuestions = quiz?.questions || [];
  function ratingFor(id: string, current = ratings) {
    return current[id] ?? "unrated";
  }
  const questionById = useMemo(
    () => new Map(allQuestions.map((card) => [card.id, card])),
    [allQuestions],
  );
  const questions = useMemo(
    () =>
      allQuestions.filter(
        (card) =>
          reviewFilter === "all" ||
          (ratings[card.id] ?? "unrated") === reviewFilter,
      ),
    [allQuestions, reviewFilter, ratings],
  );
  const currentCard = questionById.get(sequence[index]);
  const question =
    currentCard &&
    (reviewFilter === "all" || ratingFor(currentCard.id) === reviewFilter)
      ? currentCard
      : undefined;
  const currentQuestionIndex = useMemo(
    () => questions.findIndex((card) => card.id === question?.id),
    [questions, question],
  );
  const answeredIds = useMemo(
    () =>
      allQuestions
        .filter((card) =>
          hasCompleteAnswer(card, selections[card.id], typedAnswers[card.id]),
        )
        .map((card) => card.id),
    [allQuestions, selections, typedAnswers],
  );
  const answeredSet = useMemo(() => new Set(answeredIds), [answeredIds]);
  const visitedIds = useMemo(
    () => new Set(sequence.slice(0, index + 1)),
    [sequence, index],
  );
  const progressMarkers = useMemo(
    () =>
      questions.map((card, i) => {
        const rating = ratings[card.id];
        return (
          <span
            key={card.id}
            role="img"
            aria-label={`Card ${i + 1}: ${rating || "not rated"}`}
            style={{
              backgroundColor: rating
                ? reviewColors[rating]
                : visitedIds.has(card.id)
                  ? "var(--purple)"
                  : "transparent",
            }}
          />
        );
      }),
    [questions, ratings, visitedIds],
  );
  const multipleSelections = !!question && allowsMultipleSelections(question);
  const correctChoices = useMemo(
    () => new Set(question ? correctIndices(question) : []),
    [question],
  );
  const selectedChoices = question ? selections[question.id] || [] : [];
  const choiceAnswerComplete =
    !!question &&
    ["multiple", "boolean"].includes(question.type) &&
    correctChoices.size > 0 &&
    selectedChoices.length >= correctChoices.size;
  const selectedCorrectCount = selectedChoices.filter((choice) =>
    correctChoices.has(choice),
  ).length;
  const revealChoiceResults =
    choiceAnswerComplete &&
    (selectedCorrectCount !== correctChoices.size ||
      selectedChoices.length !== correctChoices.size);
  const choiceFeedback =
    selectedCorrectCount === correctChoices.size &&
    selectedChoices.length === correctChoices.size
      ? "🎉 Perfect!"
      : selectedCorrectCount > 0
        ? "🙂 Almost!"
        : "💪 Not quite!";
  function isAnswered(card: Question) {
    return answeredSet.has(card.id);
  }
  function hasLockedAnswer(card: Question) {
    return ["multiple", "boolean"].includes(card.type) && isAnswered(card);
  }
  const unanswered = useMemo(
    () => allQuestions.filter((card) => !answeredSet.has(card.id)),
    [allQuestions, answeredSet],
  );
  const pending = useMemo(
    () =>
      pendingReviewIds(
        allQuestions.map((card) => card.id),
        ratings,
        answeredIds,
      ),
    [allQuestions, ratings, answeredIds],
  );
  const currentUnanswered = !!question && !isAnswered(question);
  const requiredNoteId = question
    ? `required-answer-${question.id}`
    : undefined;
  function changeFilter(value: "all" | ReviewRating) {
    if (finishing) return;
    setCelebration(null);
    setReviewFilter(value);
    setSequence(
      allQuestions
        .filter((card) => value === "all" || ratingFor(card.id) === value)
        .map((card) => card.id),
    );
    setIndex(0);
    setComplete(false);
    setFlipped(false);
    setMotion(0);
    setShowRequired(false);
  }
  function rate(rating: ReviewRating) {
    if (!question || expired || finishing) return;
    const nextRatings = { ...ratings, [question.id]: rating };
    setRatings(nextRatings);
    if (reviewFilter !== "all" && rating !== reviewFilter) {
      // Continue through the remaining cards before starting another filtered pass.
      const remaining = sequence
        .slice(index + 1)
        .filter((id) => ratingFor(id, nextRatings) === reviewFilter);
      setSequence(
        remaining.length
          ? remaining
          : allQuestions
              .filter(
                (card) => ratingFor(card.id, nextRatings) === reviewFilter,
              )
              .map((card) => card.id),
      );
      setIndex(0);
      setComplete(false);
      setFlipped(false);
      setShowRequired(false);
    }
  }
  async function move(direction: number, swipeRating?: ReviewRating) {
    if (!quiz || loading || expired || finishing) return;
    setCelebration(null);
    const answerComplete =
      question &&
      (["multiple", "boolean"].includes(question.type)
        ? choiceAnswerComplete
        : isAnswered(question));
    const nextRating =
      direction > 0 && question
        ? !answerComplete
          ? "unrated"
          : swipeRating
        : undefined;
    const nextRatings =
      nextRating && question
        ? { ...ratings, [question.id]: nextRating }
        : ratings;
    if (nextRating) setRatings(nextRatings);
    const leavesFilter =
      nextRating && reviewFilter !== "all" && reviewFilter !== nextRating;
    if (leavesFilter) {
      const remaining = sequence
        .slice(index + 1)
        .filter((id) => ratingFor(id, nextRatings) === reviewFilter);
      if (remaining.length) {
        setSequence(remaining);
        setIndex(0);
        setFlipped(false);
        setMotion(direction);
        setShowRequired(false);
        return;
      }
    }
    const next = leavesFilter ? sequence.length : index + direction;
    if (next < 0) return;
    if (next >= sequence.length) {
      const nextPending = pendingReviewIds(
        allQuestions.map((card) => card.id),
        nextRatings,
        allQuestions.filter(isAnswered).map((card) => card.id),
      );
      if (nextPending.length) {
        const repeating = new Set(
          nextPending.filter((id) => !hasLockedAnswer(questionById.get(id)!)),
        );
        setSelections((current) =>
          Object.fromEntries(
            Object.entries(current).filter(([id]) => !repeating.has(id)),
          ),
        );
        setTypedAnswers((current) =>
          Object.fromEntries(
            Object.entries(current).filter(([id]) => !repeating.has(id)),
          ),
        );
        setReviewFilter("all");
        setSequence(nextPending);
        setIndex(0);
        setFlipped(false);
        setMotion(1);
        setShowRequired(false);
      } else {
        setFinishing(true);
        setSaveError("");
        try {
          if (!previewQuiz)
            await recordStudyCompletion(sourceQuiz.current!, {
              ...progressSnapshot(true),
              ratings: nextRatings,
            });
          setComplete(true);
        } catch (error) {
          setSaveError((error as Error).message);
        } finally {
          setFinishing(false);
        }
      }
      return;
    }
    setMotion(direction);
    setFlipped(false);
    setIndex(next);
  }
  const answer =
    question?.accepted
      .filter((value) => value.trim())
      .join(question?.type === "multiple" ? ", " : " / ") ||
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
          className={`flashcards-page has-fit-cards${question?.questionImage || question?.answerImage ? " has-picture-card" : ""}`}
          onKeyDown={(event) => {
            if (
              (event.target as Element).closest(
                'input, textarea, select, [role="combobox"], [role="listbox"], [contenteditable=true]',
              )
            )
              return;
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
            Selected choices have a green border when correct and a red border
            when incorrect. Use Reveal answer to flip the card. Swipe left for
            the next question and mark a completed answer SATISFIED, and right
            to also advance and mark a completed answer BAD. Use Previous to go
            back. Press Escape to exit.
          </Dialog.Description>
          <button className="text-link" onClick={onBack}>
            <ArrowLeft size={16} /> {backLabel}
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
          {saveError && (
            <p className="alert" role="alert">
              {saveError}
            </p>
          )}
          {!loading && !error && !expired && allQuestions.length > 0 && (
            <div className="flashcards-status">
              <span aria-live="polite" aria-atomic="true">
                {question
                  ? `Card ${currentQuestionIndex + 1} of ${questions.length}`
                  : `${questions.length} cards`}
              </span>
              <div className="flashcard-study-settings">
                <div className="flashcard-rating-filter">
                  <Select
                    label="Flashcard rating filter"
                    value={reviewFilter}
                    onChange={(value) =>
                      changeFilter(value as "all" | ReviewRating)
                    }
                    options={[
                      { value: "all", label: "All cards" },
                      ...reviewRatings.map(({ value, emoji, label }) => ({
                        value,
                        label: `${emoji} ${label}`,
                      })),
                    ]}
                  />
                </div>
                {deadline !== null && (
                  <span
                    className="timer"
                    role="timer"
                    aria-label="Study time remaining"
                  >
                    {Math.floor(
                      Math.max(0, Math.ceil((deadline - now) / 1000)) / 60,
                    )}
                    :
                    {String(
                      Math.max(0, Math.ceil((deadline - now) / 1000)) % 60,
                    ).padStart(2, "0")}
                  </span>
                )}
              </div>
            </div>
          )}
          {loading ? (
            <div className="panel empty-state" role="status">
              Opening your flashcards…
            </div>
          ) : error ? (
            <div className="alert" role="alert">
              {error}
            </div>
          ) : expired ? (
            <section className="panel empty-state" role="status">
              <h2>Study time is up</h2>
              <p>
                Your flashcard session has ended. Start again when you are
                ready.
              </p>
              <Button onClick={restart}>
                <RotateCcw size={16} /> Start again
              </Button>
            </section>
          ) : complete ? (
            <section className="panel empty-state" role="status">
              <h2>Session complete</h2>
              <p>You have answered every card and marked each one SATISFIED.</p>
              <Button onClick={restart}>
                <RotateCcw size={16} /> Start again
              </Button>
            </section>
          ) : !question && reviewFilter !== "all" ? (
            <section className="panel empty-state" role="status">
              <h2>
                No {reviewFilter === "bad" ? "BAD" : reviewFilter} cards yet
              </h2>
              <p>
                Only cards with this emoji rating appear here. Choose All cards
                to rate more questions.
              </p>
              <Button onClick={() => changeFilter("all")}>
                Show all cards
              </Button>
            </section>
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
              <div
                className="progress-track flashcard-progress"
                role="group"
                aria-label="Card review progress"
              >
                {progressMarkers}
              </div>
              <div
                role="group"
                tabIndex={0}
                className={`flashcard ${flipped ? "is-flipped" : ""}`}
                aria-label={`Flashcard: ${plainQuestionText(question.prompt) || `Question ${index + 1}`}`}
                onPointerDown={(event) => {
                  if ((event.target as Element).closest("input, textarea")) {
                    gesture.current = null;
                    return;
                  }
                  ignoreClickUntil.current = 0;
                  gesture.current = { x: event.clientX, y: event.clientY };
                  (event.target as Element).setPointerCapture(event.pointerId);
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
                    move(1, dx < 0 ? "satisfied" : "bad");
                  }
                }}
              >
                <span
                  className={`flashcard-inner ${motion > 0 ? "swipe-next" : motion < 0 ? "swipe-previous" : ""}`}
                  key={`${sessionIdentity.current.id}-${question.id}-${index}`}
                >
                  <FlashcardFace
                    side="front"
                    hidden={flipped}
                    fit
                    footer={
                      ["multiple", "boolean"].includes(question.type) ? (
                        <span
                          className="flashcard-choice-feedback"
                          role="status"
                          aria-live="polite"
                          aria-atomic="true"
                        >
                          {choiceAnswerComplete ? choiceFeedback : ""}
                        </span>
                      ) : undefined
                    }
                  >
                    <span className="eyebrow">
                      QUESTION {currentQuestionIndex + 1}
                    </span>
                    <span className="flashcard-text">
                      <FormattedQuestion
                        text={question.prompt || "Add a question in Edit quiz."}
                      />
                    </span>
                    {question.questionImage && (
                      <img
                        className="flashcard-image"
                        src={question.questionImage}
                        alt="Question picture"
                        draggable={false}
                      />
                    )}
                    <span
                      id={requiredNoteId}
                      className={`flashcard-required-note ${showRequired && (currentUnanswered || ratings[question.id] !== "satisfied") ? "needs-answer" : ""}`}
                      role={
                        showRequired &&
                        (currentUnanswered ||
                          ratings[question.id] !== "satisfied")
                          ? "alert"
                          : undefined
                      }
                    >
                      {showRequired && currentUnanswered
                        ? `Answer required before finishing. ${unanswered.length} question${unanswered.length === 1 ? "" : "s"} still unanswered; you can skip and return.`
                        : showRequired && ratings[question.id] !== "satisfied"
                          ? "Choose SATISFIED when you are satisfied with your answer. You can skip and review again after this pass."
                          : "Answer and choose SATISFIED to finish. You can skip and return after this pass."}
                    </span>
                    {!["multiple", "boolean"].includes(question.type) && (
                      <label className="flashcard-typed-answer">
                        Your answer <span aria-hidden="true">*</span>
                        <input
                          type="text"
                          required
                          aria-required="true"
                          aria-invalid={showRequired && currentUnanswered}
                          aria-describedby={requiredNoteId}
                          autoComplete="off"
                          spellCheck={false}
                          placeholder="Type your answer"
                          value={typedAnswers[question.id] || ""}
                          onChange={(event) =>
                            setTypedAnswers((current) => ({
                              ...current,
                              [question.id]: event.target.value,
                            }))
                          }
                        />
                      </label>
                    )}
                    {["multiple", "boolean"].includes(question.type) && (
                      <span
                        className="flashcard-options"
                        role="group"
                        aria-label="Answer choices (required)"
                        aria-describedby={requiredNoteId}
                      >
                        {question.options.map((option, i) => (
                          <button
                            type="button"
                            className="flashcard-option"
                            disabled={choiceAnswerComplete}
                            key={i}
                            aria-label={`${String.fromCharCode(65 + i)}. ${option}`}
                            aria-pressed={
                              selections[question.id]?.includes(i) ?? false
                            }
                            data-answer-state={
                              revealChoiceResults || selectedChoices.includes(i)
                                ? correctChoices.has(i)
                                  ? "correct"
                                  : "incorrect"
                                : undefined
                            }
                            aria-describedby={
                              selectedChoices.includes(i) || revealChoiceResults
                                ? `${requiredNoteId}-${i}`
                                : undefined
                            }
                            onClick={(event) => {
                              event.stopPropagation();
                              if (
                                expired ||
                                finishing ||
                                choiceAnswerComplete ||
                                (event.detail !== 0 &&
                                  Date.now() < ignoreClickUntil.current)
                              )
                                return;
                              const selected = selections[question.id] || [];
                              const next = !multipleSelections
                                ? [i]
                                : selected.includes(i)
                                  ? selected.filter((value) => value !== i)
                                  : [...selected, i];
                              setSelections({
                                ...selections,
                                [question.id]: next,
                              });
                              if (
                                correctChoices.size > 0 &&
                                next.length === correctChoices.size &&
                                next.every((choice) =>
                                  correctChoices.has(choice),
                                ) &&
                                !window.matchMedia(
                                  "(prefers-reduced-motion: reduce)",
                                ).matches
                              ) {
                                setCelebration(question.id);
                              }
                              const options =
                                event.currentTarget.closest(
                                  ".flashcard-options",
                                );
                              options?.getAnimations().forEach((animation) => {
                                if (animation.id === "incorrect-answer-shake")
                                  animation.cancel();
                              });
                              if (
                                options &&
                                correctChoices.size > 0 &&
                                next.length >= correctChoices.size &&
                                (next.length !== correctChoices.size ||
                                  next.some(
                                    (choice) => !correctChoices.has(choice),
                                  )) &&
                                !window.matchMedia(
                                  "(prefers-reduced-motion: reduce)",
                                ).matches
                              ) {
                                const shake = options.animate(
                                  [0, -3, 3, -2, 2, 0].map((offset) => ({
                                    transform: `translateX(${offset}px)`,
                                  })),
                                  { duration: 280, easing: "ease-out" },
                                );
                                shake.id = "incorrect-answer-shake";
                              }
                            }}
                          >
                            <span className="flashcard-option-label">
                              {String.fromCharCode(65 + i)}.{" "}
                            </span>
                            <span className="flashcard-option-text">
                              {option}
                            </span>
                            {(selectedChoices.includes(i) ||
                              revealChoiceResults) && (
                              <span
                                id={`${requiredNoteId}-${i}`}
                                className="sr-only"
                              >
                                {correctChoices.has(i)
                                  ? "Correct answer"
                                  : "Incorrect answer"}
                              </span>
                            )}
                          </button>
                        ))}
                      </span>
                    )}
                    <button
                      type="button"
                      className="flashcard-flip-hint"
                      disabled={!canReveal}
                      onClick={(event) => {
                        event.stopPropagation();
                        if (
                          canReveal &&
                          (event.detail === 0 ||
                            Date.now() >= ignoreClickUntil.current)
                        ) {
                          setFlipped(true);
                          event.currentTarget
                            .closest<HTMLElement>(".flashcard")
                            ?.focus();
                        }
                      }}
                    >
                      <RotateCw size={17} />{" "}
                      {canReveal ? "Reveal answer" : "Answer reveal is off"}
                    </button>
                  </FlashcardFace>
                  <FlashcardFace side="back" hidden={!flipped} fit>
                    {!["multiple", "boolean"].includes(question.type) &&
                      typedAnswers[question.id]?.trim() && (
                        <span className="flashcard-submitted-answer">
                          Your answer:{" "}
                          {highlightAnswer(
                            typedAnswers[question.id],
                            question.accepted,
                          ).map((part, i) =>
                            part.matched ? (
                              <mark className="flashcard-matched-word" key={i}>
                                {part.text}
                              </mark>
                            ) : (
                              part.text
                            ),
                          )}
                        </span>
                      )}
                    <span className="eyebrow">THE ANSWER</span>
                    <span className="flashcard-text">
                      {!canReveal
                        ? "Answer reveal is off"
                        : !["multiple", "boolean"].includes(question.type) &&
                            question.accepted.some((value) => value.trim())
                          ? question.accepted
                              .filter((value) => value.trim())
                              .map((value, alternative) => (
                                <Fragment key={alternative}>
                                  {alternative > 0 && " / "}
                                  {highlightAnswer(value, [
                                    typedAnswers[question.id] || "",
                                  ]).map((part, i) =>
                                    part.matched ? (
                                      <mark
                                        className="flashcard-matched-word"
                                        key={i}
                                      >
                                        {part.text}
                                      </mark>
                                    ) : (
                                      part.text
                                    ),
                                  )}
                                </Fragment>
                              ))
                          : answer}
                    </span>
                    {canReveal && question.answerImage && (
                      <img
                        className="flashcard-image"
                        src={question.answerImage}
                        alt="Answer picture"
                        draggable={false}
                      />
                    )}
                    {canReveal &&
                      question.type !== "blank" &&
                      question.explanation && (
                        <span className="flashcard-explanation">
                          {question.explanation}
                        </span>
                      )}
                    <button
                      type="button"
                      className="flashcard-flip-hint"
                      onClick={(event) => {
                        event.stopPropagation();
                        setFlipped(false);
                        event.currentTarget
                          .closest<HTMLElement>(".flashcard")
                          ?.focus();
                      }}
                    >
                      <RotateCw size={17} /> Show question
                    </button>
                  </FlashcardFace>
                </span>
                {celebration === question.id && (
                  <span className="flashcard-celebration" aria-hidden="true">
                    {Array.from({ length: 20 }, (_, i) => {
                      const angle = (i / 20) * Math.PI * 2;
                      const distance = 65 + (i % 4) * 30;
                      return (
                        <span
                          key={i}
                          className="flashcard-confetti"
                          style={
                            {
                              backgroundColor: [
                                "#4b8060",
                                "#fbbf24",
                                "#a78bfa",
                                "#60a5fa",
                              ][i % 4],
                              "--confetti-x": `${Math.cos(angle) * distance}px`,
                              "--confetti-y": `${Math.sin(angle) * distance - 35}px`,
                              "--confetti-spin": `${i * 77}deg`,
                            } as React.CSSProperties
                          }
                        />
                      );
                    })}
                  </span>
                )}
                <div
                  className="flashcard-ratings"
                  role="group"
                  aria-label="Rate this card"
                >
                  {reviewRatings.map(({ value, emoji, label, hint }) => (
                    <button
                      type="button"
                      key={value}
                      className={`flashcard-rating review-${value}`}
                      aria-label={label}
                      aria-pressed={ratingFor(question.id) === value}
                      title={`${label}: ${hint}`}
                      onClick={(event) => {
                        if (
                          event.detail !== 0 &&
                          Date.now() < ignoreClickUntil.current
                        )
                          return;
                        rate(value);
                      }}
                    >
                      <span aria-hidden="true" className="rating-emoji">
                        {emoji}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
              <div className="flashcard-controls">
                <Button
                  variant="outline"
                  disabled={index === 0 || finishing}
                  onClick={() => move(-1)}
                >
                  <ArrowLeft size={16} /> Previous
                </Button>
                <Button
                  variant="ghost"
                  aria-label="Start again"
                  disabled={finishing}
                  onClick={restart}
                >
                  <RotateCcw size={16} /> <span>Start again</span>
                </Button>
                <Button disabled={finishing} onClick={() => move(1)}>
                  {finishing
                    ? "Saving session…"
                    : index === sequence.length - 1
                      ? unanswered.length
                        ? "Review unanswered"
                        : pending.length
                          ? "Review remaining"
                          : "Finish session"
                      : "Next card"}
                  <ArrowRight size={16} />
                </Button>
              </div>
            </>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
