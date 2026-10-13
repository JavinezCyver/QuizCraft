import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  Plus,
  Copy,
  Trash2,
  ArrowUp,
  ArrowDown,
  Check,
  Eye,
  Globe,
  Save,
  Image,
  Settings2,
  GripVertical,
} from "lucide-react";
import { Button } from "./ui/button";
import { api, categories, share, type Quiz, type Question } from "../lib/api";
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
  onPreview,
  notify,
}: {
  id: string;
  onBack: () => void;
  onPreview: (q: Quiz) => void;
  notify: (s: string) => void;
}) {
  const [quiz, setQuiz] = useState<Quiz | null>(null),
    [selected, setSelected] = useState(0),
    [saving, setSaving] = useState("Loading draft…"),
    [tab, setTab] = useState("questions"),
    [error, setError] = useState("");
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
      });
      setSaving(publish ? "Published" : "Draft saved");
      setError("");
      dirty.current = false;
      if (publish) {
        notify("Quiz published! Your link is ready to share.");
        await navigator.clipboard.writeText(share(id)).catch(() => {});
        onBack();
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
  function reorder(delta: number) {
    const target = selected + delta;
    if (target < 0 || target >= list.length) return;
    const next = [...list];
    [next[selected], next[target]] = [next[target], next[selected]];
    change({ questions: next });
    setSelected(target);
  }
  if (!quiz)
    return (
      <div className="page-loading">{error || "Opening your studio…"}</div>
    );
  return (
    <>
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
          02 <span>Settings & sharing</span>
        </button>
      </div>
      {tab === "questions" ? (
        <div className="studio-grid">
          <aside className="panel question-list">
            <h3>
              Questions <span>{list.length}</span>
            </h3>
            {list.map((q, i) => (
              <div
                key={q.id}
                className={`question-list-row ${selected === i ? "active" : ""}`}
              >
                <button
                  className="question-select"
                  onClick={() => setSelected(i)}
                >
                  <GripVertical size={14} />
                  <b>{i + 1}</b>
                  <span>{q.prompt || "Untitled question"}</span>
                </button>
                <button
                  className="icon-btn danger question-delete"
                  aria-label={`Delete question ${i + 1}`}
                  onClick={() => removeQuestion(i)}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
            <Button
              variant="outline"
              onClick={() => {
                change({ questions: [...list, fresh()] });
                setSelected(list.length);
              }}
            >
              <Plus size={16} /> Add question
            </Button>
            <div className="studio-tip">
              A little variety goes a long way. Mix question types to keep
              things interesting.
            </div>
          </aside>
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
                  <select
                    value={quiz.category}
                    onChange={(e) => change({ category: e.target.value })}
                  >
                    {categories.map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Difficulty
                  <select
                    value={quiz.difficulty}
                    onChange={(e) => change({ difficulty: e.target.value })}
                  >
                    {["Easy", "Intermediate", "Advanced"].map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </select>
                </label>
              </div>
              <label>
                <Image size={15} /> Cover image URL
                <input
                  type="url"
                  value={quiz.cover}
                  onChange={(e) => change({ cover: e.target.value })}
                  placeholder="https://…"
                />
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
              <section className="panel question-editor">
                <div className="section-heading">
                  <h2>Question {selected + 1}</h2>
                  <div className="button-row">
                    <button
                      className="icon-btn"
                      aria-label="Move question up"
                      disabled={selected === 0}
                      onClick={() => reorder(-1)}
                    >
                      <ArrowUp size={17} />
                    </button>
                    <button
                      className="icon-btn"
                      aria-label="Move question down"
                      disabled={selected === list.length - 1}
                      onClick={() => reorder(1)}
                    >
                      <ArrowDown size={17} />
                    </button>
                    <button
                      className="icon-btn"
                      aria-label="Duplicate question"
                      onClick={() => {
                        change({
                          questions: [
                            ...list,
                            { ...question, id: crypto.randomUUID() },
                          ],
                        });
                        setSelected(list.length);
                      }}
                    >
                      <Copy size={17} />
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
                    <select
                      value={question.type}
                      onChange={(e) => {
                        const type = e.target.value as Question["type"];
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
                    >
                      <option value="multiple">Multiple choice</option>
                      <option value="boolean">True or false</option>
                      <option value="blank">Fill in the blank</option>
                      <option value="short">Short answer</option>
                    </select>
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
                        <input
                          type="radio"
                          aria-label={`Mark option ${i + 1} correct`}
                          name={`correct-${question.id}`}
                          checked={correctOption === i}
                          onChange={() =>
                            update({ accepted: [option], correctOption: i })
                          }
                        />
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
          <p>Choose how people discover and take your quiz.</p>
          <div className="field-row">
            <label>
              Visibility
              <select
                value={quiz.visibility}
                onChange={(e) =>
                  change({ visibility: e.target.value as Quiz["visibility"] })
                }
              >
                <option value="public">Public — appears in discovery</option>
                <option value="unlisted">
                  Unlisted — anyone with the link
                </option>
                <option value="private">Private — only you</option>
              </select>
            </label>
            <label>
              Question layout
              <select
                value={quiz.settings.layout}
                onChange={(e) =>
                  change({
                    settings: {
                      ...quiz.settings,
                      layout: e.target.value as "single" | "all",
                    },
                  })
                }
              >
                <option value="single">One question at a time</option>
                <option value="all">All questions</option>
              </select>
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
                "guests",
                "Allow guests",
                "People can take this quiz without an account.",
              ],
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
                "Public leaderboard",
                "Participants choose whether to appear.",
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
