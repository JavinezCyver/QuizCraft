import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  Plus,
  Trash2,
  ArrowUp,
  ArrowDown,
  Check,
  Eye,
  Globe,
  Save,
  Image,
  Settings2,
} from "lucide-react";
import { Button } from "./ui/button";
import { Select } from "./ui/select";
import { Dialog } from "./ui/dialog";
import { api, type Quiz, type Question, type Library } from "../lib/api";
import { correctIndices } from "../lib/questions";
import { QuestionEditor } from "./QuestionEditor";
import { readCoverImage } from "../lib/cover";
import { CardImageUpload } from "./CardImageUpload";
const fresh = (): Question => ({
  id: crypto.randomUUID(),
  type: "blank",
  prompt: "",
  options: [],
  accepted: [],
  explanation: "",
  points: 10,
});
export function Studio({
  id,
  onBack,
  onPublished,
  onPreview,
  notify,
}: {
  id: string;
  onBack: () => void;
  onPublished: (quiz: Quiz) => Promise<void>;
  onPreview: (q: Quiz) => void;
  notify: (s: string) => void;
}) {
  const [quiz, setQuiz] = useState<Quiz | null>(null),
    [selected, setSelected] = useState(0),
    [coverBusy, setCoverBusy] = useState(false),
    [imageUploads, setImageUploads] = useState<Record<string, boolean>>({}),
    [coverError, setCoverError] = useState(""),
    [saving, setSaving] = useState("Loading draft…"),
    [tab, setTab] = useState("questions"),
    [error, setError] = useState(""),
    [knownCategories, setKnownCategories] = useState<string[]>([]),
    [newCategory, setNewCategory] = useState(""),
    [addCategoryOpen, setAddCategoryOpen] = useState(false),
    [categoryError, setCategoryError] = useState(""),
    [deleteCategoryOpen, setDeleteCategoryOpen] = useState(false),
    [deletingCategory, setDeletingCategory] = useState(false);
  const coverRequest = useRef(0);
  const questionPanel = useRef<HTMLElement>(null);
  const imagesBusy = coverBusy || Object.values(imageUploads).some(Boolean);
  const imageBusy = (key: string, busy: boolean) =>
    setImageUploads((current) =>
      current[key] === busy ? current : { ...current, [key]: busy },
    );
  useEffect(
    () => () => {
      coverRequest.current++;
    },
    [id],
  );
  const version = useRef(0),
    initial = useRef(true),
    saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null),
    saveQueue = useRef<Promise<unknown>>(Promise.resolve()),
    latestQuiz = useRef<Quiz | null>(null),
    dirty = useRef(false);
  latestQuiz.current = quiz;
  useEffect(
    () => () => {
      if (dirty.current && latestQuiz.current) {
        const draft = latestQuiz.current;
        saveQueue.current = saveQueue.current
          .catch(() => {})
          .then(() =>
            api("/quizzes/" + id, "PUT", { ...draft, status: "draft" }),
          )
          .catch((e) => notify("Draft could not be saved: " + e.message));
      }
    },
    [id],
  );
  useEffect(() => {
    initial.current = true;
    api<Library>("/library")
      .then((library) =>
        setKnownCategories(library.quizzes.map((quiz) => quiz.category)),
      )
      .catch(() => {});
    api<Quiz>("/quizzes/" + id)
      .then((q) => {
        setQuiz({
          ...q,
          questions: q.questions?.map((question) =>
            question.type === "short"
              ? { ...question, type: "blank" }
              : question,
          ),
        });
        setSaving("All changes saved");
      })
      .catch((e) => setError(e.message));
  }, [id]);
  useEffect(() => {
    if (!quiz) return;
    if (initial.current) {
      initial.current = false;
      return;
    }
    const current = ++version.current;
    setSaving("Unsaved changes");
    const timer = setTimeout(() => {
      setSaving("Saving…");
      saveQueue.current = saveQueue.current
        .catch(() => {})
        .then(() => api("/quizzes/" + id, "PUT", { ...quiz, status: "draft" }))
        .then(() => {
          if (current === version.current) {
            setSaving("Draft saved");
            dirty.current = false;
          }
        })
        .catch((e) => {
          setSaving("Could not save");
          setError(e.message);
        });
    }, 1000);
    saveTimer.current = timer;
    return () => clearTimeout(timer);
  }, [quiz, id]);
  const change = (patch: Partial<Quiz>) => {
    dirty.current = true;
    setQuiz((q) => (q ? { ...q, ...patch } : q));
  };
  const list = quiz?.questions || [];
  const categoryOptions = Array.from(
    new Set([...knownCategories, ...(quiz ? [quiz.category] : [])]),
  ).sort((a, b) => a.localeCompare(b));
  function addCategory() {
    const name = newCategory.trim().replace(/\s+/g, " ");
    if (!name || name.length > 60 || /[\u0000-\u001f\u007f]/.test(name)) {
      setCategoryError("Enter a category from 1 to 60 characters.");
      return;
    }
    const canonical =
      categoryOptions.find(
        (value) => value.toLowerCase() === name.toLowerCase(),
      ) || name;
    setKnownCategories((values) => [...values, canonical]);
    change({ category: canonical });
    setNewCategory("");
    setCategoryError("");
    setAddCategoryOpen(false);
    notify("Category selected: " + canonical);
  }
  async function deleteCategory() {
    if (!quiz || quiz.category === "Uncategorized") return;
    setDeletingCategory(true);
    setCategoryError("");
    try {
      // Flush pending edits first so an older autosave cannot restore the label.
      if (saveTimer.current) clearTimeout(saveTimer.current);
      await saveQueue.current;
      if (dirty.current)
        await api("/quizzes/" + id, "PUT", { ...quiz, status: "draft" });
      await api("/categories", "DELETE", { name: quiz.category });
      setKnownCategories((values) =>
        values.filter((value) => value !== quiz.category),
      );
      initial.current = true;
      dirty.current = false;
      setQuiz((current) =>
        current ? { ...current, category: "Uncategorized" } : current,
      );
      setSaving("All changes saved");
      setDeleteCategoryOpen(false);
      notify("Category deleted. Your quizzes are now Uncategorized.");
    } catch (error) {
      setCategoryError((error as Error).message);
    } finally {
      setDeletingCategory(false);
    }
  }
  const question = list[selected];
  const correctOptions = question ? correctIndices(question) : [];
  function setCorrectOptions(indices: number[], options = question.options) {
    update({
      options,
      correctOptions: indices,
      correctOption: null,
      accepted: indices.map((i) => options[i]),
    });
  }
  function removeQuestion(index: number) {
    const remaining = list.filter((_, i) => i !== index);
    const currentIndex = remaining.findIndex((q) => q.id === question?.id);
    change({ questions: remaining });
    setSelected(
      currentIndex >= 0
        ? currentIndex
        : Math.max(0, Math.min(index, remaining.length - 1)),
    );
  }
  const update = (patch: Partial<Question>) =>
    change({
      questions: list.map((q, i) => (i === selected ? { ...q, ...patch } : q)),
    });
  async function save(publish = false, preview = false) {
    if (!quiz) return;
    if (imagesBusy) {
      setError("Wait for your pictures to finish processing before saving.");
      return;
    }
    if (saveTimer.current) clearTimeout(saveTimer.current);
    try {
      await saveQueue.current;
      await api("/quizzes/" + id, "PUT", {
        ...quiz,
        status: publish ? "published" : "draft",
        visibility: quiz.visibility,
      });
      setSaving(publish ? "Published" : "Draft saved");
      setError("");
      dirty.current = false;
      if (publish) {
        notify(
          quiz.visibility === "public"
            ? "Quiz published to Discover on this device."
            : "Quiz ready in My quizzes.",
        );
        await onPublished(quiz);
      }
      if (preview) onPreview({ ...quiz, preview: true });
      else if (!publish) {
        notify("Draft saved.");
        onBack();
      }
    } catch (e) {
      setError((e as Error).message);
    }
  }
  function switchQuestion(delta: number) {
    if (imagesBusy) return;
    const target = selected + delta;
    if (target < 0 || target >= list.length) return;
    setSelected(target);
  }
  function addQuestion() {
    if (imagesBusy) return;
    change({ questions: [...list, fresh()] });
    setSelected(list.length);
    requestAnimationFrame(() => {
      questionPanel.current?.scrollIntoView({ block: "start" });
    });
  }
  if (!quiz)
    return (
      <div className="page-loading">{error || "Opening your studio…"}</div>
    );
  return (
    <>
      <Dialog
        open={addCategoryOpen}
        onOpenChange={setAddCategoryOpen}
        title="Add new category"
      >
        <form
          onSubmit={(event) => {
            event.preventDefault();
            addCategory();
          }}
        >
          <label>
            Category name
            <input
              autoFocus
              value={newCategory}
              maxLength={60}
              placeholder="e.g. Anatomy, Pharmacology, Nursing"
              onChange={(event) => {
                setNewCategory(event.target.value);
                setCategoryError("");
              }}
            />
          </label>
          {categoryError && <p role="alert">{categoryError}</p>}
          <div className="delete-dialog-actions">
            <Button
              type="button"
              variant="outline"
              onClick={() => setAddCategoryOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit">Create category</Button>
          </div>
        </form>
      </Dialog>
      <Dialog
        open={deleteCategoryOpen}
        onOpenChange={(open) => {
          if (!deletingCategory) setDeleteCategoryOpen(open);
        }}
        title="Delete category?"
      >
        <p>
          Delete “{quiz.category}” from your quizzes? They will move to
          Uncategorized. Your quizzes and questions will be kept.
        </p>
        {categoryError && <p role="alert">{categoryError}</p>}
        <div className="delete-dialog-actions">
          <Button
            variant="outline"
            disabled={deletingCategory}
            onClick={() => setDeleteCategoryOpen(false)}
          >
            Cancel
          </Button>
          <Button disabled={deletingCategory} onClick={deleteCategory}>
            <Trash2 size={16} />{" "}
            {deletingCategory ? "Deleting…" : "Delete category"}
          </Button>
        </div>
      </Dialog>
      <div className="page-title studio-heading">
        <div>
          <button className="text-link" disabled={imagesBusy} onClick={onBack}>
            <ArrowLeft size={16} /> My quizzes
          </button>
          <h1>
            Flashcard creation studio <span className="pill">DRAFT</span>
          </h1>
          <p>
            <Check size={14} /> {saving}
          </p>
        </div>
        <div className="button-row">
          <Button
            variant="outline"
            disabled={imagesBusy}
            onClick={() => save(false, true)}
          >
            <Eye size={16} /> Preview
          </Button>
          <Button disabled={imagesBusy} onClick={() => save(true)}>
            <Globe size={16} /> Publish quiz
          </Button>
        </div>
      </div>
      {error && (
        <div className="alert" role="alert">
          {error}
        </div>
      )}
      <div className="studio-tabs">
        <button
          className={tab === "questions" ? "active" : ""}
          disabled={imagesBusy}
          onClick={() => setTab("questions")}
        >
          01 <span>Quiz & questions</span>
        </button>
        <button
          className={tab === "settings" ? "active" : ""}
          disabled={imagesBusy}
          onClick={() => setTab("settings")}
        >
          02 <span>Flashcard settings</span>
        </button>
      </div>
      {tab === "questions" ? (
        <div className="studio-layout">
          <div className="studio-fields">
            <section className="panel">
              <h2>The big picture</h2>
              <p>Give your quiz a name that sparks curiosity.</p>
              <label>
                Quiz title
                <input
                  value={quiz.title}
                  maxLength={140}
                  onChange={(e) => change({ title: e.target.value })}
                  placeholder="What will we discover?"
                />
              </label>
              <label>
                Description
                <textarea
                  value={quiz.description}
                  onChange={(e) => change({ description: e.target.value })}
                  placeholder="What would you like to study?"
                />
              </label>
              <div className="field-row">
                <label>
                  Category
                  <div className="category-select-row">
                    <Select
                      label="Quiz category"
                      value={quiz.category}
                      onChange={(category) => {
                        if (category === "\u0000add-category") {
                          setNewCategory("");
                          setCategoryError("");
                          setAddCategoryOpen(true);
                        } else change({ category });
                      }}
                      options={[
                        ...categoryOptions.map((value) => ({
                          value,
                          label: value,
                        })),
                        {
                          value: "\u0000add-category",
                          label: "+ Add new category",
                        },
                      ]}
                    />
                    <button
                      type="button"
                      className="icon-btn danger"
                      aria-label="Delete category"
                      title="Delete category"
                      disabled={quiz.category === "Uncategorized"}
                      onClick={() => {
                        setCategoryError("");
                        setDeleteCategoryOpen(true);
                      }}
                    >
                      <Trash2 size={17} />
                    </button>
                  </div>
                </label>
              </div>
              <label>
                <Image size={15} /> Cover image (saved offline)
                <input
                  type="file"
                  accept="image/*"
                  disabled={coverBusy}
                  aria-label="Cover image"
                  onChange={async (event) => {
                    const file = event.target.files?.[0];
                    event.target.value = "";
                    if (!file) return;
                    const request = ++coverRequest.current;
                    setCoverBusy(true);
                    setCoverError("");
                    try {
                      const cover = await readCoverImage(file);
                      if (request === coverRequest.current) change({ cover });
                    } catch (error) {
                      if (request === coverRequest.current)
                        setCoverError((error as Error).message);
                    } finally {
                      if (request === coverRequest.current) setCoverBusy(false);
                    }
                  }}
                />
                {coverBusy && <span role="status">Preparing cover image?</span>}
                {coverError && <span role="alert">{coverError}</span>}
                {quiz.cover && (
                  <img
                    className="studio-cover-preview"
                    src={quiz.cover}
                    alt="Quiz cover preview"
                  />
                )}
                {quiz.cover && (
                  <button
                    type="button"
                    className="text-link"
                    onClick={() => {
                      coverRequest.current++;
                      setCoverBusy(false);
                      setCoverError("");
                      change({ cover: "" });
                    }}
                  >
                    Remove cover image
                  </button>
                )}
              </label>
              <div className="theme-field" role="group" aria-label="Color theme">
                <span>Color theme</span>
                <div className="theme-options">
                  {[
                    "purple",
                    "space",
                    "world",
                    "nature",
                    "history",
                    "movies",
                  ].map((c) => (
                    <button
                      key={c}
                      type="button"
                      aria-label={`${c} theme`}
                      aria-pressed={quiz.theme === c}
                      onClick={() => change({ theme: c })}
                      className={`theme-swatch ${c} ${quiz.theme === c ? "chosen" : ""}`}
                    >
                      {quiz.theme === c && <Check size={18} />}
                    </button>
                  ))}
                </div>
              </div>
            </section>
            {question ? (
              <section
                ref={questionPanel}
                className="panel question-editor"
                key={question.id}
              >
                <div className="section-heading">
                  <h2>Question {selected + 1}</h2>
                  <div className="button-row">
                    <button
                      className="icon-btn"
                      aria-label="Previous question"
                      title="Previous question"
                      disabled={selected === 0 || imagesBusy}
                      onClick={() => switchQuestion(-1)}
                    >
                      <ArrowUp size={17} />
                    </button>
                    <button
                      className="icon-btn"
                      aria-label="Next question"
                      title="Next question"
                      disabled={selected === list.length - 1 || imagesBusy}
                      onClick={() => switchQuestion(1)}
                    >
                      <ArrowDown size={17} />
                    </button>
                    <button
                      className="icon-btn"
                      aria-label="Add blank question"
                      disabled={imagesBusy}
                      title="Add blank question"
                      onClick={addQuestion}
                    >
                      <Plus size={17} />
                    </button>
                    <button
                      className="icon-btn danger"
                      aria-label="Delete question"
                      disabled={imagesBusy}
                      onClick={() => removeQuestion(selected)}
                    >
                      <Trash2 size={17} />
                    </button>
                  </div>
                </div>
                <div className="field-row">
                  <label>
                    Question type
                    <Select
                      label="Question type"
                      value={question.type}
                      onChange={(value) => {
                        const type = value as Question["type"];
                        update({
                          type,
                          options:
                            type === "boolean"
                              ? ["True", "False"]
                              : type === "multiple"
                                ? ["", "", "", ""]
                                : [],
                          accepted: [],
                          correctOption: null,
                          correctOptions: [],
                        });
                      }}
                      options={[
                        { value: "multiple", label: "Multiple choice" },
                        { value: "boolean", label: "True or false" },
                        { value: "blank", label: "Fill in the blank" },
                      ]}
                    />
                  </label>
                </div>
                <QuestionEditor
                  key={question.id}
                  value={question.prompt}
                  onChange={(prompt) => update({ prompt })}
                />
                <CardImageUpload
                  side="Question"
                  value={question.questionImage}
                  onBusyChange={(busy) =>
                    imageBusy(`${question.id}:question`, busy)
                  }
                  onChange={(questionImage) => update({ questionImage })}
                />
                {["multiple", "boolean"].includes(question.type) ? (
                  <div>
                    <label>
                      Answer options{" "}
                      <span className="muted">
                        {question.type === "multiple"
                          ? "Select all correct answers"
                          : "Select the correct answer"}
                      </span>
                    </label>
                    <p>
                      Type the answer text into each field, then select the
                      control beside each correct answer.
                    </p>
                    {question.options.map((option, i) => (
                      <div className="option-edit" key={i}>
                        <label className="correct-option-toggle">
                          <input
                            type={
                              question.type === "multiple"
                                ? "checkbox"
                                : "radio"
                            }
                            aria-label={`Mark option ${i + 1} correct`}
                            name={`correct-${question.id}`}
                            checked={correctOptions.includes(i)}
                            onChange={() =>
                              setCorrectOptions(
                                question.type === "boolean"
                                  ? [i]
                                  : correctOptions.includes(i)
                                    ? correctOptions.filter((n) => n !== i)
                                    : [...correctOptions, i].sort(
                                        (a, b) => a - b,
                                      ),
                              )
                            }
                          />
                        </label>
                        <input
                          aria-label={`Option ${i + 1}`}
                          value={option}
                          readOnly={question.type === "boolean"}
                          placeholder={`Enter answer option ${String.fromCharCode(65 + i)}`}
                          onChange={(e) =>
                            setCorrectOptions(
                              correctOptions,
                              question.options.map((x, n) =>
                                i === n ? e.target.value : x,
                              ),
                            )
                          }
                        />
                        {question.type === "multiple" && (
                          <button
                            className="icon-btn"
                            aria-label={`Remove option ${i + 1}`}
                            disabled={question.options.length <= 2}
                            onClick={() =>
                              setCorrectOptions(
                                correctOptions
                                  .filter((n) => n !== i)
                                  .map((n) => (n > i ? n - 1 : n)),
                                question.options.filter((_, n) => n !== i),
                              )
                            }
                          >
                            <Trash2 size={15} />
                          </button>
                        )}
                      </div>
                    ))}
                    {question.type === "multiple" &&
                      question.options.length < 8 && (
                        <button
                          className="text-link"
                          onClick={() =>
                            update({ options: [...question.options, ""] })
                          }
                        >
                          <Plus size={15} /> Add option
                        </button>
                      )}
                  </div>
                ) : (
                  <label>
                    Accepted answers (one per line)
                    <textarea
                      value={question.accepted.join("\n")}
                      onChange={(e) =>
                        update({
                          accepted: e.target.value
                            ? e.target.value.split("\n")
                            : [],
                        })
                      }
                      placeholder="Enter at least one accepted answer"
                    />
                    <small>
                      Answers ignore capitalization and extra spaces.
                    </small>
                  </label>
                )}
                <CardImageUpload
                  side="Answer"
                  value={question.answerImage}
                  onBusyChange={(busy) =>
                    imageBusy(`${question.id}:answer`, busy)
                  }
                  onChange={(answerImage) => update({ answerImage })}
                />
                {question.type !== "blank" && (
                  <label className="answer-explanation-field">
                    Answer explanation (optional)
                    <textarea
                      value={question.explanation}
                      onChange={(e) => update({ explanation: e.target.value })}
                      placeholder="Help learners understand the answer."
                    />
                  </label>
                )}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="new-question-button"
                  disabled={imagesBusy}
                  onClick={addQuestion}
                >
                  <Plus size={16} /> New Question
                </Button>
              </section>
            ) : (
              <div className="empty-state panel">
                <Plus size={32} />
                <h2>Start with a great question</h2>
                <p>Add your first question to bring this quiz to life.</p>
                <Button onClick={() => change({ questions: [fresh()] })}>
                  <Plus size={16} /> Add first question
                </Button>
              </div>
            )}
            <div className="studio-footer">
              <span>
                {list.filter((q) => q.prompt && q.accepted.length).length} of{" "}
                {list.length} questions ready
              </span>
              <Button
                variant="outline"
                disabled={imagesBusy}
                onClick={() => save()}
              >
                <Save size={16} /> Save draft
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <section className="panel settings-panel">
          <h2>
            <Settings2 size={20} /> Make it your own
          </h2>
          <p>Choose how you study these flashcards on this device.</p>
          <div className="field-row">
            <label>
              Visibility
              <Select
                label="Visibility"
                value={quiz.visibility}
                onChange={(value) =>
                  change({ visibility: value as Quiz["visibility"] })
                }
                options={[
                  { value: "public", label: "Show in Discover" },
                  {
                    value: "unlisted",
                    label: "Only in My quizzes",
                  },
                  { value: "private", label: "Only in My quizzes" },
                ]}
              />
            </label>
          </div>
          <div className="field-row">
            <label>
              Study time (minutes, 0 = unlimited)
              <input
                type="number"
                min="0"
                max="180"
                value={quiz.settings.time}
                onChange={(e) =>
                  change({
                    settings: {
                      ...quiz.settings,
                      time: Math.max(0, Math.min(180, Number(e.target.value))),
                    },
                  })
                }
              />
            </label>
          </div>
          {(
            [
              [
                "showAnswers",
                "Reveal answers",
                "Allow flipping cards to see correct answers and explanations.",
              ],
              [
                "randomQuestions",
                "Shuffle cards",
                "Give each study session a fresh card order.",
              ],
              [
                "randomAnswers",
                "Shuffle answer choices",
                "Randomize multiple-choice options.",
              ],
            ] as const
          ).map(([key, title, description]) => (
            <label className="setting-row" key={key}>
              <div>
                <b>{title}</b>
                <small>{description}</small>
              </div>
              <input
                type="checkbox"
                role="switch"
                checked={!!quiz.settings[key]}
                onChange={(e) =>
                  change({
                    settings: { ...quiz.settings, [key]: e.target.checked },
                  })
                }
              />
            </label>
          ))}
          <Button disabled={imagesBusy} onClick={() => save(true)}>
            <Globe size={16} /> Publish quiz
          </Button>
        </section>
      )}
    </>
  );
}
