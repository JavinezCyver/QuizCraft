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
import { readCoverImage } from "../lib/cover";
const fresh = (): Question => ({
  id: crypto.randomUUID(),
  type: "multiple",
  prompt: "",
  options: ["", "", "", ""],
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
  onPublished: () => Promise<void>;
  onPreview: (q: Quiz) => void;
  notify: (s: string) => void;
}) {
  const [quiz, setQuiz] = useState<Quiz | null>(null),
    [selected, setSelected] = useState(0),
    [coverBusy, setCoverBusy] = useState(false),
    [coverError, setCoverError] = useState(""),
    [saving, setSaving] = useState("Loading draft…"),
    [tab, setTab] = useState("questions"),
    [error, setError] = useState(""),
    [knownCategories, setKnownCategories] = useState<string[]>([]),
    [newCategory, setNewCategory] = useState(""),
    [categoryError, setCategoryError] = useState(""),
    [deleteCategoryOpen, setDeleteCategoryOpen] = useState(false),
    [deletingCategory, setDeletingCategory] = useState(false);
  const coverRequest = useRef(0);
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
        setQuiz(q);
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
  const correctOption =
    question?.correctOption ??
    (question?.accepted.length
      ? question.options.indexOf(question.accepted[0])
      : -1);
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
    if (saveTimer.current) clearTimeout(saveTimer.current);
    try {
      await saveQueue.current;
      await api("/quizzes/" + id, "PUT", {
        ...quiz,
        status: publish ? "published" : "draft",
        visibility: publish ? "public" : quiz.visibility,
      });
      setSaving(publish ? "Published" : "Draft saved");
      setError("");
      dirty.current = false;
      if (publish) {
        notify("Quiz published to Discover on this device.");
        await onPublished();
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
    const target = selected + delta;
    if (target < 0 || target >= list.length) return;
    setSelected(target);
  }
  if (!quiz)
    return (
      <div className="page-loading">{error || "Opening your studio…"}</div>
    );
  return (
    <>
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
          <button className="text-link" onClick={onBack}>
            <ArrowLeft size={16} /> My quizzes
          </button>
          <h1>
            Quiz creation studio <span className="pill">DRAFT</span>
          </h1>
          <p>
            <Check size={14} /> {saving}
          </p>
        </div>
        <div className="button-row">
          <Button variant="outline" onClick={() => save(false, true)}>
            <Eye size={16} /> Preview
          </Button>
          <Button onClick={() => save(true)}>
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
          onClick={() => setTab("questions")}
        >
          01 <span>Quiz & questions</span>
        </button>
        <button
          className={tab === "settings" ? "active" : ""}
          onClick={() => setTab("settings")}
        >
          02 <span>Quiz settings</span>
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
                  placeholder="Tell people what your quiz is about…"
                />
              </label>
              <div className="field-row">
                <label>
                  Category
                  <div className="category-select-row">
                    <Select
                      label="Quiz category"
                      value={quiz.category}
                      onChange={(category) => change({ category })}
                      options={categoryOptions.map((value) => ({
                        value,
                        label: value,
                      }))}
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
                <label>
                  Difficulty
                  <Select
                    label="Quiz difficulty"
                    value={quiz.difficulty}
                    onChange={(difficulty) => change({ difficulty })}
                    options={["Easy", "Intermediate", "Advanced"].map(
                      (value) => ({ value, label: value }),
                    )}
                  />
                </label>
              </div>
              <div className="custom-category-row">
                <label>
                  New category
                  <input
                    value={newCategory}
                    maxLength={60}
                    placeholder="e.g. Anatomy, Pharmacology, Nursing"
                    onChange={(event) => {
                      setNewCategory(event.target.value);
                      setCategoryError("");
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        addCategory();
                      }
                    }}
                  />
                </label>
                <Button type="button" variant="outline" onClick={addCategory}>
                  <Plus size={16} /> Add category
                </Button>
              </div>
              <p className="muted">
                Add a subject for your field. It is saved with this quiz and
                available for your other quizzes.
              </p>
              {categoryError && <p role="alert">{categoryError}</p>}
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
              <label>
                Color theme
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
                      onClick={() => change({ theme: c })}
                      className={`theme-swatch ${c} ${quiz.theme === c ? "chosen" : ""}`}
                    >
                      {quiz.theme === c && <Check size={18} />}
                    </button>
                  ))}
                </div>
              </label>
            </section>
            {question ? (
              <section className="panel question-editor" key={question.id}>
                <div className="section-heading">
                  <h2>Question {selected + 1}</h2>
                  <div className="button-row">
                    <button
                      className="icon-btn"
                      aria-label="Previous question"
                      title="Previous question"
                      disabled={selected === 0}
                      onClick={() => switchQuestion(-1)}
                    >
                      <ArrowUp size={17} />
                    </button>
                    <button
                      className="icon-btn"
                      aria-label="Next question"
                      title="Next question"
                      disabled={selected === list.length - 1}
                      onClick={() => switchQuestion(1)}
                    >
                      <ArrowDown size={17} />
                    </button>
                    <button
                      className="icon-btn"
                      aria-label="Add blank question"
                      title="Add blank question"
                      onClick={() => {
                        change({
                          questions: [...list, fresh()],
                        });
                        setSelected(list.length);
                      }}
                    >
                      <Plus size={17} />
                    </button>
                    <button
                      className="icon-btn danger"
                      aria-label="Delete question"
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
                        });
                      }}
                      options={[
                        { value: "multiple", label: "Multiple choice" },
                        { value: "boolean", label: "True or false" },
                        { value: "blank", label: "Fill in the blank" },
                        { value: "short", label: "Short answer" },
                      ]}
                    />
                  </label>
                  <label>
                    Points
                    <input
                      type="number"
                      min={1}
                      max={1000}
                      value={question.points}
                      onChange={(e) =>
                        update({ points: Number(e.target.value) })
                      }
                    />
                  </label>
                </div>
                <label>
                  Your question
                  <textarea
                    value={question.prompt}
                    onChange={(e) => update({ prompt: e.target.value })}
                    placeholder="Ask something interesting…"
                  />
                </label>
                {["multiple", "boolean"].includes(question.type) ? (
                  <div>
                    <label>
                      Answer options{" "}
                      <span className="muted">Select the correct answer</span>
                    </label>
                    <p>
                      Type the answer text into each field, then select the
                      circle beside the correct answer.
                    </p>
                    {question.options.map((option, i) => (
                      <div className="option-edit" key={i}>
                        <label className="correct-option-toggle">
                          <input
                            type="radio"
                            aria-label={`Mark option ${i + 1} correct`}
                            name={`correct-${question.id}`}
                            checked={correctOption === i}
                            onChange={() =>
                              update({ accepted: [option], correctOption: i })
                            }
                          />
                        </label>
                        <input
                          aria-label={`Option ${i + 1}`}
                          value={option}
                          readOnly={question.type === "boolean"}
                          placeholder={`Enter answer option ${String.fromCharCode(65 + i)}`}
                          onChange={(e) =>
                            update({
                              options: question.options.map((x, n) =>
                                i === n ? e.target.value : x,
                              ),
                              accepted:
                                correctOption === i
                                  ? [e.target.value]
                                  : question.accepted,
                            })
                          }
                        />
                        {question.type === "multiple" && (
                          <button
                            className="icon-btn"
                            aria-label={`Remove option ${i + 1}`}
                            disabled={question.options.length <= 2}
                            onClick={() =>
                              update({
                                options: question.options.filter(
                                  (_, n) => n !== i,
                                ),
                                accepted:
                                  correctOption === i ? [] : question.accepted,
                                correctOption:
                                  correctOption === i
                                    ? null
                                    : correctOption > i
                                      ? correctOption - 1
                                      : correctOption >= 0
                                        ? correctOption
                                        : null,
                              })
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
                      placeholder={
                        question.type === "short"
                          ? "Leave empty to grade manually"
                          : "Enter at least one accepted answer"
                      }
                    />
                    <small>
                      Answers ignore capitalization and extra spaces.
                    </small>
                  </label>
                )}
                <label>
                  Answer explanation
                  <textarea
                    value={question.explanation}
                    onChange={(e) => update({ explanation: e.target.value })}
                    placeholder="Help learners understand the answer."
                  />
                </label>
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
              <Button variant="outline" onClick={() => save()}>
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
          <p>Choose how you study this quiz on this device.</p>
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
            <label>
              Question layout
              <Select
                label="Question layout"
                value={quiz.settings.layout}
                onChange={(value) =>
                  change({
                    settings: {
                      ...quiz.settings,
                      layout: value as "single" | "all",
                    },
                  })
                }
                options={[
                  { value: "single", label: "One question at a time" },
                  { value: "all", label: "All questions" },
                ]}
              />
            </label>
          </div>
          <div className="field-row">
            <label>
              Time limit (minutes, 0 = unlimited)
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
            <label>
              Passing score (%)
              <input
                type="number"
                min="0"
                max="100"
                value={quiz.settings.passing}
                onChange={(e) =>
                  change({
                    settings: {
                      ...quiz.settings,
                      passing: Math.max(
                        0,
                        Math.min(100, Number(e.target.value)),
                      ),
                    },
                  })
                }
              />
            </label>
          </div>
          {(
            [
              [
                "review",
                "Review before submitting",
                "Let learners check their answers.",
              ],
              [
                "showAnswers",
                "Show correct answers",
                "Include explanations in the results.",
              ],
              [
                "rankings",
                "Device leaderboard",
                "Keep scores for learners using this device.",
              ],
              [
                "randomQuestions",
                "Shuffle questions",
                "Give every attempt a fresh order.",
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
          <Button onClick={() => save(true)}>
            <Globe size={16} /> Publish quiz
          </Button>
        </section>
      )}
    </>
  );
}
