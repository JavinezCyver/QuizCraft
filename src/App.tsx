import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowRight,
  Atom,
  BookOpen,
  Bookmark,
  Check,
  ChevronDown,
  ChevronRight,
  Compass,
  Flame,
  GraduationCap,
  History,
  LayoutDashboard,
  Menu,
  Moon,
  Plus,
  Search,
  Settings,
  Sparkles,
  Sun,
  Target,
  Trophy,
  Users,
  X,
  Zap,
  Globe,
  Calculator,
  Cpu,
  Clapperboard,
  Landmark,
  Copy,
  Pencil,
  Clock,
  Trash2,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Button } from "./components/ui/button";
import { Select } from "./components/ui/select";
import { Dialog } from "./components/ui/dialog";
import { Studio } from "./components/Studio";
import { Flashcards } from "./components/Flashcards";
import { AppUpdates } from "./components/AppUpdates";
import { Toast } from "./components/Toast";
import { api, type Quiz, type User, type Library } from "./lib/api";
import { localUser } from "./lib/offline";
import {
  exportData,
  downloadData,
  importQuizzes,
  restoreBackup,
} from "./lib/transfer";
const categoryIcons: Record<string, LucideIcon> = {
  Education: GraduationCap,
  Science: Atom,
  Mathematics: Calculator,
  Technology: Cpu,
  History: Landmark,
  Entertainment: Clapperboard,
  "General Knowledge": Globe,
};
const navItems = [
  { id: "home", label: "Discover", icon: Compass },
  { id: "dashboard", label: "My dashboard", icon: LayoutDashboard },
  { id: "quizzes", label: "My quizzes", icon: BookOpen },
  { id: "bookmarks", label: "Saved quizzes", icon: Bookmark },
  { id: "history", label: "Quiz history", icon: History },
];
function QuizCard({
  quiz,
  onOpen,
  onSave,
  saved,
  onEdit,
  onDelete,
}: {
  quiz: Quiz;
  onOpen: () => void;
  onSave: () => void;
  saved: boolean;
  onEdit?: () => void;
  onDelete?: () => void;
}) {
  const Icon = categoryIcons[quiz.category] || BookOpen;
  return (
    <article className="quiz-card">
      <button
        className={`quiz-cover cover-${quiz.theme}${quiz.cover ? " has-uploaded-cover" : ""}`}
        onClick={onOpen}
        tabIndex={-1}
        aria-label={`Open ${quiz.title}`}
      >
        {quiz.cover && (
          <img
            className="quiz-cover-image"
            src={quiz.cover}
            alt=""
            draggable={false}
          />
        )}
        <span className="cover-shade" />
        <span className="cover-category">
          <Icon size={12} />
          {quiz.category}
        </span>
        {quiz.id === "cosmos" && (
          <span className="cover-featured">
            <Zap size={11} /> POPULAR
          </span>
        )}
        {!quiz.cover && <Icon className="fallback-cover-icon" size={62} />}
      </button>
      <button
        className={`card-bookmark ${saved ? "saved" : ""}`}
        aria-label={saved ? "Remove bookmark" : "Bookmark quiz"}
        onClick={onSave}
      >
        <Bookmark size={17} fill={saved ? "currentColor" : "none"} />
      </button>
      <div className="quiz-card-body">
        <div className="tag-row">
          <span className="question-count">{quiz.questionCount} questions</span>
          {!!quiz.demo && <span className="demo-tag">Demo</span>}
          {quiz.status === "draft" && <span className="pill">Draft</span>}
        </div>
        <button className="card-title" onClick={onOpen}>
          {quiz.title}
        </button>
        <p>{quiz.description || "Your next great quiz starts here."}</p>
        <div className="card-footer">
          <div className="creator">
            <span className={`mini-avatar avatar-${quiz.theme}`}>
              {(quiz.creator || "You").slice(0, 1)}
            </span>
            <span>{quiz.creator || "You"}</span>
          </div>
          <span className="plays">
            <Users size={13} />
            {quiz.plays || 0}
          </span>
        </div>
        {(onEdit || onDelete) && (
          <div className="card-actions">
            {onEdit && (
              <button className="text-link" onClick={onEdit}>
                <Pencil size={14} /> Edit quiz
              </button>
            )}
            {onDelete && (
              <button className="text-link danger" onClick={onDelete}>
                <Trash2 size={14} /> Delete
              </button>
            )}
          </div>
        )}
      </div>
    </article>
  );
}
export default function App({ onReady }: { onReady?: () => void } = {}) {
  const [view, setView] = useState("home"),
    [quizzes, setQuizzes] = useState<Quiz[]>([]),
    [user, setUser] = useState<User>(localUser),
    [library, setLibrary] = useState<Library>({
      quizzes: [],
      bookmarks: [],
      attempts: [],
    }),
    [loading, setLoading] = useState(true),
    [loadError, setLoadError] = useState(""),
    [search, setSearch] = useState(""),
    [category, setCategory] = useState("All topics"),
    [studyCategory, setStudyCategory] = useState("All categories"),
    [studySort, setStudySort] = useState("recent"),
    [sort, setSort] = useState("popular"),
    [transfer, setTransfer] = useState(false),
    [transferText, setTransferText] = useState(""),
    [transferError, setTransferError] = useState(""),
    [busy, setBusy] = useState(false),
    [toast, setToast] = useState<{ id: number; message: string } | null>(null),
    [mobile, setMobile] = useState(false),
    [dark, setDark] = useState(
      localStorage.getItem("quizcraft-theme") === "dark",
    ),
    [activeQuiz, setActiveQuiz] = useState<Quiz | null>(null),
    [flashcardsReturnView, setFlashcardsReturnView] = useState("home"),
    [editId, setEditId] = useState(""),
    [profile, setProfile] = useState(false),
    [deleteTarget, setDeleteTarget] = useState<Quiz | null>(null),
    [deleting, setDeleting] = useState(false),
    [deleteError, setDeleteError] = useState(""),
    [grading, setGrading] = useState<any[]>([]);
  const toastId = useRef(0);
  const notify = (message: string) =>
    setToast({ id: ++toastId.current, message });
  const dismissToast = useCallback((id: number) => {
    setToast((current) => (current?.id === id ? null : current));
  }, []);
  const refreshLibrary = () =>
    api<Library>("/library")
      .then((library) => {
        setLibrary(library);
        setQuizzes(
          library.quizzes.filter(
            (quiz) =>
              quiz.status === "published" && quiz.visibility === "public",
          ),
        );
      })
      .catch(() => {});
  async function load() {
    setLoading(true);
    setLoadError("");
    try {
      const [savedLibrary, u] = await Promise.all([
        api<Library>("/library"),
        api<User>("/me"),
      ]);
      setLibrary(savedLibrary);
      setQuizzes(
        savedLibrary.quizzes.filter(
          (quiz) => quiz.status === "published" && quiz.visibility === "public",
        ),
      );
      setUser(u);
      const id = new URLSearchParams(location.search).get("quiz");
      if (id) {
        const selected = await api<Quiz>("/quizzes/" + id);
        setActiveQuiz(selected);
        const previousView = window.history.state?.quizReturnView;
        setFlashcardsReturnView(
          navItems.some((item) => item.id === previousView)
            ? previousView
            : selected.owner === u?.id
              ? "quizzes"
              : "home",
        );
        setView("flashcards");
      }
    } catch (e) {
      setLoadError((e as Error).message);
    } finally {
      setLoading(false);
      onReady?.();
    }
  }
  useEffect(() => {
    void load();
  }, []);
  useEffect(() => {
    const mobileLayout = window.matchMedia("(max-width: 760px)");
    const closeDesktopMenu = () => {
      if (!mobileLayout.matches) setMobile(false);
    };
    mobileLayout.addEventListener("change", closeDesktopMenu);
    return () => mobileLayout.removeEventListener("change", closeDesktopMenu);
  }, []);
  useEffect(() => {
    const handler = (event: PromiseRejectionEvent) => {
      event.preventDefault();
      notify(
        event.reason?.message ||
          "This action could not be completed. Please try again.",
      );
    };
    window.addEventListener("unhandledrejection", handler);
    return () => window.removeEventListener("unhandledrejection", handler);
  }, []);
  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    localStorage.setItem("quizcraft-theme", dark ? "dark" : "light");
  }, [dark]);
  function navigate(next: string) {
    setView(next);
    setMobile(false);
    setSearch("");
    setCategory("All topics");
    window.history.replaceState({}, "", location.pathname);
    window.scrollTo({ top: 0, behavior: "smooth" });
    if (user) void refreshLibrary();
    if (next === "quizzes")
      api("/grading")
        .then(setGrading)
        .catch(() => {});
  }
  useEffect(() => {
    const handleBack = () => {
      if (document.querySelector('[role="dialog"], [role="listbox"]')) {
        document.dispatchEvent(
          new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
        );
        return;
      }
      if (mobile) {
        setMobile(false);
        return;
      }
      if (view === "studio") navigate("quizzes");
      else if (view === "flashcards") navigate(flashcardsReturnView);
      else if (view !== "home") navigate("home");
    };
    window.addEventListener("quizcraft-back", handleBack);
    return () => window.removeEventListener("quizcraft-back", handleBack);
  }, [view, mobile, flashcardsReturnView]);
  async function createQuiz() {
    try {
      const q = await api<{ id: string }>("/quizzes", "POST", {});
      setEditId(q.id);
      setView("studio");
    } catch (e) {
      notify((e as Error).message);
    }
  }
  async function saveQuiz(q: Quiz) {
    const saved = library.bookmarks.includes(q.id);
    try {
      await api("/bookmarks/" + q.id, "POST", { saved: !saved });
      await refreshLibrary();
      notify(saved ? "Removed from saved quizzes." : "Quiz saved for later.");
    } catch (e) {
      notify((e as Error).message);
    }
  }
  async function openQuiz(q: Quiz) {
    try {
      setActiveQuiz(await api<Quiz>("/quizzes/" + q.id));
      setFlashcardsReturnView(view);
      setView("flashcards");
      window.history.replaceState(
        { quizReturnView: view },
        "",
        `?quiz=${q.id}`,
      );
      window.scrollTo(0, 0);
    } catch (e) {
      notify((e as Error).message);
    }
  }
  async function openExport(quiz?: Quiz) {
    try {
      setProfile(false);
      setTransferText(await exportData(quiz));
      setTransferError("");
      setTransfer(true);
    } catch (error) {
      notify((error as Error).message);
    }
  }
  const filtered = useMemo(() => {
    const needle = search.toLowerCase();
    return quizzes
      .filter(
        (q) =>
          (category === "All topics" || q.category === category) &&
          `${q.title} ${q.description} ${q.category} ${q.creator}`
            .toLowerCase()
            .includes(needle),
      )
      .sort((a, b) =>
        sort === "newest"
          ? String(b.created).localeCompare(String(a.created))
          : (b.plays || 0) - (a.plays || 0),
      );
  }, [quizzes, category, search, sort]);
  const explore = () => {
    if (view !== "home") setView("home");
    setTimeout(
      () =>
        document
          .getElementById("explore")
          ?.scrollIntoView({ behavior: "smooth", block: "start" }),
      50,
    );
  };
  const discoverCategories = useMemo(
    () =>
      Array.from(new Set(quizzes.map((q) => q.category))).sort((a, b) =>
        a.localeCompare(b),
      ),
    [quizzes],
  );
  const categories = useMemo(
    () =>
      Array.from(new Set(library.quizzes.map((q) => q.category))).sort((a, b) =>
        a.localeCompare(b),
      ),
    [library.quizzes],
  );
  const studyQuizzes = useMemo(
    () =>
      library.quizzes
        .filter(
          (q) =>
            (studyCategory === "All categories" ||
              q.category === studyCategory) &&
            (!["draft", "published"].includes(sort) || q.status === sort),
        )
        .sort((a, b) =>
          studySort === "category"
            ? a.category.localeCompare(b.category) ||
              a.title.localeCompare(b.title)
            : String(b.created || "").localeCompare(String(a.created || "")),
        ),
    [library.quizzes, studyCategory, sort, studySort],
  );
  const cards = (items: Quiz[], editable = false) => (
    <div className="quiz-grid" role="region" aria-label="Quizzes" tabIndex={0}>
      {items.map((q) => (
        <QuizCard
          key={q.id}
          quiz={q}
          onOpen={() => openQuiz(q)}
          onSave={() => saveQuiz(q)}
          saved={library.bookmarks.includes(q.id)}
          onEdit={
            editable
              ? () => {
                  setEditId(q.id);
                  setView("studio");
                }
              : undefined
          }
          onDelete={
            editable
              ? () => {
                  setDeleteError("");
                  setDeleteTarget(q);
                }
              : undefined
          }
        />
      ))}
    </div>
  );
  const seenQuizzes = new Set<string>();
  const quizHistory = library.attempts.filter((attempt) => {
    if (seenQuizzes.has(attempt.quiz_id)) return false;
    seenQuizzes.add(attempt.quiz_id);
    return true;
  });
  const totalAttempts = library.attempts.length,
    average = totalAttempts
      ? Math.round(
          library.attempts.reduce(
            (n, a) => n + (a.score / a.maximum) * 100,
            0,
          ) / totalAttempts,
        )
      : 0;
  const showCreateQuiz = view === "quizzes";
  const title =
    view === "bookmarks"
      ? "Your next discoveries"
      : view === "quizzes"
        ? "Made by you"
        : view === "history"
          ? "Look how far you’ve come"
          : "A little progress, every day";
  return (
    <div className="app-shell">
      <aside
        id="quizcraft-navigation"
        className={`sidebar ${mobile ? "mobile-open" : ""}`}
      >
        <a
          className="brand"
          href="/"
          onClick={(e) => {
            e.preventDefault();
            navigate("home");
          }}
        >
          <span className="brand-icon">
            <Zap size={22} fill="currentColor" />
          </span>
          Quiz<span>Craft</span>
          <span className="brand-dot">.</span>
        </a>
        <button
          className="mobile-close icon-btn"
          aria-label="Close menu"
          onClick={() => setMobile(false)}
        >
          <X size={20} />
        </button>
        <div className="workspace-label">YOUR LEARNING SPACE</div>
        <nav>
          {navItems.map(({ id, label, icon: Icon }) => (
            <button
              className={view === id ? "nav-item active" : "nav-item"}
              aria-label={label}
              key={id}
              onClick={() => navigate(id)}
            >
              <Icon size={19} />
              <span>{label}</span>
              {id === "home" && <span className="nav-dot" />}
              {id === "bookmarks" && library.bookmarks.length > 0 && (
                <span className="nav-count">{library.bookmarks.length}</span>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-divider" />
        <div className="workspace-label">KEEP THE CURIOSITY GOING</div>
        <button className="nav-item" onClick={() => navigate("achievements")}>
          <Trophy size={19} />
          <span>Achievements</span>
          <span className="new-tag">NEW</span>
        </button>
        <button
          className="nav-item"
          onClick={() => {
            setMobile(false);
            setProfile(true);
          }}
        >
          <Settings size={19} />
          <span>Settings</span>
        </button>
        <div className="sidebar-bottom">
          <button className="theme-toggle" onClick={() => setDark(!dark)}>
            {dark ? <Sun size={17} /> : <Moon size={17} />}
            <span>{dark ? "Light mode" : "Dark mode"}</span>
            <span className={`switch ${dark ? "on" : ""}`}>
              <i />
            </span>
          </button>
          <div className="sidebar-user">
            <span className="user-avatar">
              {user?.avatar ? (
                <img src={user.avatar} alt="" />
              ) : (
                user?.name?.[0] || "G"
              )}
            </span>
            <button onClick={() => setProfile(true)}>
              <b>{user?.name || "Hello, curious mind"}</b>
              <span>Offline - saved on this device</span>
            </button>
          </div>
        </div>
      </aside>
      {mobile && (
        <div className="mobile-backdrop" onClick={() => setMobile(false)} />
      )}
      <div className="main-shell">
        <header className="topbar">
          <div className="topbar-start">
            <button
              className="mobile-menu icon-btn"
              aria-label="Open navigation"
              aria-controls="quizcraft-navigation"
              aria-expanded={mobile}
              onClick={() => setMobile(true)}
            >
              <Menu size={22} />
            </button>
            <span className="breadcrumb">
              Your daily dose of discovery <Sparkles size={14} />
            </span>
          </div>
          <div className="topbar-actions">
            <span className="community-note">
              <span /> Works fully offline
            </span>
          </div>
        </header>
        <main>
          {view === "studio" ? (
            <Studio
              key={editId}
              id={editId}
              onSaved={() => void refreshLibrary()}
              onBack={() => {
                navigate("quizzes");
                void load();
              }}
              onPublished={async (published) => {
                navigate(
                  published.visibility === "public" ? "home" : "quizzes",
                );
                setSort("newest");
                await load();
                if (published.visibility === "public")
                  requestAnimationFrame(() => {
                    document
                      .getElementById("explore")
                      ?.scrollIntoView({ behavior: "smooth", block: "start" });
                  });
              }}
              onPreview={(q) => {
                setFlashcardsReturnView("quizzes");
                setActiveQuiz({
                  ...q,
                  questionCount: q.questions?.length || 0,
                });
                setView("flashcards");
              }}
              notify={notify}
            />
          ) : view === "flashcards" && activeQuiz ? (
            <>
              {cards(studyQuizzes, true)}
              <Flashcards
                key={`${activeQuiz.id}-${activeQuiz.preview ? "preview" : "study"}`}
                quizId={activeQuiz.id}
                previewQuiz={activeQuiz.preview ? activeQuiz : undefined}
                backLabel={`Back to ${navItems.find((item) => item.id === flashcardsReturnView)?.label.toLowerCase() || "discover"}`}
                onBack={() => navigate(flashcardsReturnView)}
                onEdit={() => {
                  setEditId(activeQuiz.id);
                  setView("studio");
                }}
              />
            </>
          ) : view === "home" ? (
            <>
              <section id="explore" className="explore-section">
                <div className="discovery-controls">
                  <div className="search-field">
                    <Search size={19} />
                    <input
                      aria-label="Search quizzes"
                      placeholder="Search quizzes, topics, or creators…"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                    {search && (
                      <button
                        className="icon-btn"
                        aria-label="Clear search"
                        onClick={() => setSearch("")}
                      >
                        <X size={15} />
                      </button>
                    )}
                    <span className="search-shortcut">⌕</span>
                  </div>
                </div>
                <div className="category-tabs">
                  <button
                    className={category === "All topics" ? "active" : ""}
                    onClick={() => setCategory("All topics")}
                  >
                    <Compass size={15} />
                    All topics
                  </button>
                  {discoverCategories.map((c) => {
                    const Icon = categoryIcons[c] || BookOpen;
                    return (
                      <button
                        key={c}
                        className={category === c ? "active" : ""}
                        onClick={() => setCategory(c)}
                      >
                        <Icon size={15} />
                        {c}
                      </button>
                    );
                  })}
                </div>
                <div className="section-heading quiz-section-title">
                  <h3>
                    <Flame size={19} />{" "}
                    {search
                      ? "Search results"
                      : category !== "All topics"
                        ? `${category} quizzes`
                        : "Popular with curious minds"}
                    <span className="count-chip">{filtered.length}</span>
                  </h3>
                  <label className="sort-control">
                    Sort by:{" "}
                    <Select
                      label="Sort quizzes"
                      value={
                        ["popular", "newest"].includes(sort) ? sort : "popular"
                      }
                      onChange={setSort}
                      options={[
                        { value: "popular", label: "Most popular" },
                        { value: "newest", label: "Newest first" },
                      ]}
                    />
                  </label>
                </div>
                {loading ? (
                  <div className="quiz-grid">
                    {[1, 2, 3].map((x) => (
                      <div className="skeleton-card" key={x}>
                        <div />
                        <span />
                        <span />
                      </div>
                    ))}
                  </div>
                ) : loadError ? (
                  <div className="empty-state panel">
                    <h3>We couldn’t load the quizzes</h3>
                    <p>{loadError}</p>
                    <Button onClick={load}>Try again</Button>
                  </div>
                ) : filtered.length ? (
                  cards(filtered)
                ) : !quizzes.length ? (
                  <Empty
                    title="Your library starts here"
                    text="Create your first quiz or import a quiz file in Settings. Your questions and answers stay on this device."
                    action={() => navigate("quizzes")}
                    label="Open My quizzes"
                  />
                ) : (
                  <div className="empty-state panel">
                    <Search size={34} />
                    <h3>No quizzes found</h3>
                    <p>Try another keyword or explore a different topic.</p>
                    <Button
                      variant="outline"
                      onClick={() => {
                        setSearch("");
                        setCategory("All topics");
                      }}
                    >
                      Clear filters
                    </Button>
                  </div>
                )}
              </section>
              <footer className="footer">
                <span>
                  © {new Date().getFullYear()} QuizCraft. Made for the love of
                  learning.
                </span>
                <span>
                  Stay curious. <Sparkles size={14} />
                </span>
              </footer>
            </>
          ) : view === "achievements" ? (
            <>
              <div className="page-title">
                <span className="eyebrow">SMALL WINS, BIG POSSIBILITIES</span>
                <h1>Your curiosity collection</h1>
                <p>Every question is another step forward.</p>
              </div>
              <div className="achievement-grid">
                {[
                  {
                    icon: Compass,
                    title: "First discovery",
                    text: "Complete your first quiz",
                    unlocked: totalAttempts >= 1,
                  },
                  {
                    icon: BookOpen,
                    title: "Question maker",
                    text: "Create your first quiz",
                    unlocked: library.quizzes.length >= 1,
                  },
                  {
                    icon: Target,
                    title: "Perfect perspective",
                    text: "Earn a perfect score",
                    unlocked: library.attempts.some(
                      (a) => a.score === a.maximum,
                    ),
                  },
                  {
                    icon: Flame,
                    title: "Keep it going",
                    text: "Complete quizzes on 3 consecutive days",
                    unlocked: streak(library.attempts) >= 3,
                  },
                  {
                    icon: Bookmark,
                    title: "Curiosity collector",
                    text: "Save 3 quizzes for later",
                    unlocked: library.bookmarks.length >= 3,
                  },
                  {
                    icon: Trophy,
                    title: "A curious habit",
                    text: "Complete 10 quizzes",
                    unlocked: totalAttempts >= 10,
                  },
                ].map(({ icon: Icon, title, text, unlocked }) => (
                  <div
                    className={`panel achievement ${unlocked ? "unlocked" : ""}`}
                    key={title}
                  >
                    <span>
                      <Icon size={32} />
                    </span>
                    <h3>{title}</h3>
                    <p>{text}</p>
                    <small>{unlocked ? "Unlocked!" : "Keep exploring"}</small>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <>
              <div className="page-title">
                <div>
                  <span className="eyebrow">YOUR LEARNING SPACE</span>
                  <h1>{title}</h1>
                  <p>
                    {view === "dashboard"
                      ? `Welcome back, ${user?.name}. Follow your curiosity a little further.`
                      : view === "quizzes"
                        ? "Your ideas, ready to become someone’s next discovery."
                        : view === "bookmarks"
                          ? "A collection of quizzes for when curiosity calls."
                          : "Every attempt brings a new perspective."}
                  </p>
                </div>
                {showCreateQuiz && (
                  <Button onClick={createQuiz}>
                    <Plus size={16} /> Create a quiz
                  </Button>
                )}
              </div>
              {view === "dashboard" && (
                <>
                  <div className="stats-grid">
                    {[
                      {
                        label: "Quizzes created",
                        value: library.quizzes.length,
                        icon: BookOpen,
                      },
                      {
                        label: "Quizzes completed",
                        value: totalAttempts,
                        icon: Check,
                      },
                      {
                        label: "Average score",
                        value: average + "%",
                        icon: Target,
                      },
                      {
                        label: "Learning streak",
                        value: streak(library.attempts) + " days",
                        icon: Flame,
                      },
                    ].map(({ label, value, icon: Icon }) => (
                      <div className="panel stat" key={label}>
                        <span>
                          <Icon size={19} />
                          {label}
                        </span>
                        <strong>{value}</strong>
                        <small>A little progress adds up.</small>
                      </div>
                    ))}
                  </div>
                  <div className="dashboard-columns">
                    <section className="panel">
                      <h2>Your last 7 attempts</h2>
                      <p>Growing, one question at a time.</p>
                      <div className="bar-chart">
                        {library.attempts
                          .slice(0, 7)
                          .reverse()
                          .map((a, i) => (
                            <div key={a.id}>
                              <span>
                                {Math.round((a.score / a.maximum) * 100)}%
                              </span>
                              <i
                                style={{
                                  height: `${Math.max(4, (a.score / a.maximum) * 140)}px`,
                                }}
                              />
                              <small>#{i + 1}</small>
                            </div>
                          ))}
                        {!totalAttempts && (
                          <div className="empty-chart">
                            Your journey starts with your first quiz.
                          </div>
                        )}
                      </div>
                    </section>
                    <section className="panel">
                      <h2>Your personal best</h2>
                      <div className="personal-best">
                        <Trophy size={44} />
                        <strong>
                          {Math.max(
                            0,
                            ...library.attempts.map((a) =>
                              Math.round((a.score / a.maximum) * 100),
                            ),
                          )}
                          %
                        </strong>
                        <p>There’s always something new to discover.</p>
                        <Button variant="outline" onClick={explore}>
                          Find your next challenge
                          <ArrowRight size={16} />
                        </Button>
                      </div>
                    </section>
                  </div>
                  <div className="section-heading">
                    <h2>Recent activity</h2>
                    <button
                      className="text-link"
                      onClick={() => navigate("history")}
                    >
                      View history
                      <ArrowRight size={16} />
                    </button>
                  </div>
                  {library.attempts.length ? (
                    <div className="panel">
                      {library.attempts.slice(0, 4).map((a) => (
                        <div className="activity-row" key={a.id}>
                          <span className="activity-icon">
                            <Check size={18} />
                          </span>
                          <div>
                            <b>{a.title}</b>
                            <small>
                              {new Date(a.submitted).toLocaleDateString()} ·{" "}
                              {Math.round((a.submitted - a.started) / 1000)}{" "}
                              seconds
                            </small>
                          </div>
                          <strong>
                            {Math.round((a.score / a.maximum) * 100)}%
                          </strong>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <Empty
                      title="Your story starts here"
                      text="Take a quiz and watch your progress grow."
                      action={explore}
                      label="Explore quizzes"
                    />
                  )}
                  <div className="section-heading">
                    <h2>Back to your ideas</h2>
                    <button
                      className="text-link"
                      onClick={() => navigate("quizzes")}
                    >
                      All my quizzes
                      <ArrowRight size={16} />
                    </button>
                  </div>
                  {cards(library.quizzes.slice(0, 3), true)}
                </>
              )}
              {view === "quizzes" && (
                <>
                  <div className="study-library-controls">
                    <label>
                      Category
                      <Select
                        label="Flashcard category"
                        value={studyCategory}
                        onChange={setStudyCategory}
                        options={["All categories", ...categories].map(
                          (value) => ({ value, label: value }),
                        )}
                      />
                    </label>
                    <label>
                      Sort by
                      <Select
                        label="Sort flashcard decks"
                        value={studySort}
                        onChange={setStudySort}
                        options={[
                          { value: "recent", label: "Recently created" },
                          { value: "category", label: "Category (A-Z)" },
                        ]}
                      />
                    </label>
                    <span role="status">
                      {studyQuizzes.length}{" "}
                      {studyQuizzes.length === 1 ? "quiz" : "quizzes"} · Open a
                      deck to study
                    </span>
                  </div>
                  <div className="category-tabs">
                    <button
                      className={
                        sort !== "draft" && sort !== "published" ? "active" : ""
                      }
                      onClick={() => setSort("popular")}
                    >
                      All quizzes ({library.quizzes.length})
                    </button>
                    <button
                      className={sort === "draft" ? "active" : ""}
                      onClick={() => setSort("draft")}
                    >
                      Drafts
                    </button>
                    <button
                      className={sort === "published" ? "active" : ""}
                      onClick={() => setSort("published")}
                    >
                      Ready to study
                    </button>
                  </div>
                  {studyQuizzes.length ? (
                    cards(studyQuizzes, true)
                  ) : library.quizzes.length ? (
                    <Empty
                      title="No quizzes match your filters"
                      text="Choose another category or show all quizzes to find a flashcard deck."
                      action={() => {
                        setStudyCategory("All categories");
                        setSort("popular");
                      }}
                      label="Clear filters"
                    />
                  ) : (
                    <Empty
                      title="Your ideas deserve a quiz"
                      text="Create your first quiz and share what you know."
                      action={createQuiz}
                      label="Create a quiz"
                    />
                  )}
                  {grading.length > 0 && (
                    <section className="panel">
                      <h2>Short answers to review</h2>
                      {grading.map((r: any) => (
                        <form
                          key={r.attempt_id + r.question_id}
                          className="grading-row"
                          onSubmit={async (e) => {
                            e.preventDefault();
                            await api("/grading", "POST", {
                              attempt: r.attempt_id,
                              question: r.question_id,
                              earned: Number(
                                new FormData(e.currentTarget).get("earned"),
                              ),
                            });
                            setGrading(await api("/grading"));
                            notify("Grade saved.");
                          }}
                        >
                          <div>
                            <b>{r.prompt}</b>
                            <p>
                              {r.name}: {r.answer || "(No answer)"}
                            </p>
                          </div>
                          <label>
                            Points / {r.points}
                            <input
                              type="number"
                              name="earned"
                              min={0}
                              max={r.points}
                              required
                            />
                          </label>
                          <Button size="sm">Save grade</Button>
                        </form>
                      ))}
                    </section>
                  )}
                </>
              )}
              {view === "bookmarks" &&
                (library.bookmarks.length ? (
                  cards(
                    library.saved ||
                      quizzes.filter((q) => library.bookmarks.includes(q.id)),
                  )
                ) : (
                  <Empty
                    title="Save a little curiosity for later"
                    text="Tap the bookmark on any quiz to add it to your collection."
                    action={explore}
                    label="Find a quiz"
                  />
                ))}
              {view === "history" &&
                (quizHistory.length ? (
                  <div className="panel history-table">
                    <div className="history-table-head">
                      <span>Quiz</span>
                      <span>Score</span>
                      <span>Time</span>
                      <span>Date</span>
                    </div>
                    {quizHistory.map((a) => (
                      <div className="history-table-row" key={a.id}>
                        <div>
                          <b>{a.title}</b>
                          <small>
                            {a.kind === "flashcards"
                              ? "Flashcard session"
                              : a.pending
                                ? "Awaiting manual grading"
                                : a.score === a.maximum
                                  ? "Perfect score!"
                                  : "Completed"}
                          </small>
                        </div>
                        <strong data-label="Score">
                          {Math.round((a.score / a.maximum) * 100)}%
                        </strong>
                        <span data-label="Time">
                          {formatHistoryDuration(a.submitted - a.started)}
                        </span>
                        <time
                          data-label="Date"
                          dateTime={new Date(a.submitted).toISOString()}
                        >
                          {new Date(a.submitted).toLocaleDateString()}
                        </time>
                      </div>
                    ))}
                  </div>
                ) : (
                  <Empty
                    title="A fresh page"
                    text="Complete a quiz to see your scores and progress here."
                    action={explore}
                    label="Take your first quiz"
                  />
                ))}
            </>
          )}
        </main>
      </div>
      <Dialog
        open={profile}
        onOpenChange={setProfile}
        title="Make yourself at home"
      >
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            try {
              setUser(
                await api(
                  "/profile",
                  "PATCH",
                  Object.fromEntries(new FormData(e.currentTarget)),
                ),
              );
              setProfile(false);
              notify("Your local settings have been updated.");
            } catch (e) {
              notify((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <label>
            Display name
            <input
              name="name"
              required
              maxLength={80}
              defaultValue={user?.name}
            />
          </label>
          <p>
            Your quizzes, flashcards, and results stay on this device. No
            account or internet connection is needed.
          </p>
          <div className="button-row">
            <Button
              type="button"
              variant="outline"
              onClick={() => openExport()}
            >
              Export backup
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setProfile(false);
                setTransferText("");
                setTransferError("");
                setTransfer(true);
              }}
            >
              Import quizzes / restore backup
            </Button>
          </div>
          <div className="setting-row">
            <div>
              <b>Appearance</b>
              <small>Choose your comfortable corner.</small>
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={() => setDark(!dark)}
            >
              {dark ? <Sun size={17} /> : <Moon size={17} />}{" "}
              {dark ? "Light" : "Dark"}
            </Button>
          </div>
          {profile && <AppUpdates />}
          <Button disabled={busy}>
            Save settings
            <Check size={16} />
          </Button>
        </form>
      </Dialog>
      <Dialog
        open={transfer}
        onOpenChange={setTransfer}
        title="Transfer quizzes and backups"
      >
        <p>
          Export a backup or quiz as a JSON file. On Android, you can also
          select and copy the text below. Import quizzes to add them to your
          collection.
        </p>
        <label>
          Choose a QuizCraft JSON file
          <input
            type="file"
            accept=".json,application/json"
            disabled={busy}
            onChange={async (event) => {
              const file = event.target.files?.[0];
              if (!file) return;
              setBusy(true);
              try {
                setTransferText(await file.text());
                setTransferError("");
              } catch {
                setTransferError(
                  "This file could not be read. Choose it again.",
                );
              } finally {
                setBusy(false);
              }
            }}
          />
        </label>
        <label>
          Quiz or backup JSON
          <textarea
            rows={7}
            wrap="off"
            spellCheck={false}
            readOnly={busy}
            aria-busy={busy}
            value={transferText}
            onChange={(event) => setTransferText(event.target.value)}
          />
        </label>
        {transferError && <p role="alert">{transferError}</p>}
        {busy && <p role="status">Preparing your quiz data…</p>}
        <div className="button-row">
          <Button
            type="button"
            variant="outline"
            disabled={!transferText || busy}
            onClick={() => downloadData(transferText, "quizcraft-backup.json")}
          >
            Download JSON
          </Button>
          <Button
            disabled={!transferText || busy}
            onClick={async () => {
              setBusy(true);
              try {
                const count = await importQuizzes(transferText);
                await load();
                setTransfer(false);
                notify(`${count} quizzes imported.`);
              } catch (error) {
                setTransferError((error as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            Import quizzes
          </Button>
        </div>
        <p>
          Restore backup replaces this device's current collection, saved
          quizzes, display name, and history. Export a backup first if you want
          to keep them.
        </p>
        <Button
          variant="outline"
          disabled={!transferText || busy}
          onClick={async () => {
            setBusy(true);
            try {
              await restoreBackup(transferText);
              await load();
              setTransfer(false);
              navigate("quizzes");
              notify("Backup restored.");
            } catch (error) {
              setTransferError((error as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          Restore backup and replace local data
        </Button>
      </Dialog>
      <Dialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open && !deleting) setDeleteTarget(null);
        }}
        title="Delete this quiz?"
      >
        <p>
          “{deleteTarget?.title}” will be removed from your quizzes, discovery,
          and saved collections. Attempts for this quiz will also be removed
          from quiz history.
        </p>
        {deleteError && (
          <div className="alert" role="alert">
            {deleteError}
          </div>
        )}
        <div className="button-row delete-dialog-actions">
          <Button
            variant="outline"
            disabled={deleting}
            onClick={() => setDeleteTarget(null)}
          >
            Cancel
          </Button>
          <Button
            className="button-destructive"
            disabled={deleting}
            onClick={async () => {
              if (!deleteTarget || deleting) return;
              setDeleting(true);
              setDeleteError("");
              try {
                const id = deleteTarget.id;
                await api("/quizzes/" + id, "DELETE");
                setLibrary((current) => ({
                  ...current,
                  quizzes: current.quizzes.filter((q) => q.id !== id),
                  bookmarks: current.bookmarks.filter((q) => q !== id),
                  saved: current.saved?.filter((q) => q.id !== id),
                  attempts: current.attempts.filter((a) => a.quiz_id !== id),
                }));
                setQuizzes((current) => current.filter((q) => q.id !== id));
                setDeleteTarget(null);
                notify("Quiz deleted.");
              } catch (error) {
                setDeleteError((error as Error).message);
              } finally {
                setDeleting(false);
              }
            }}
          >
            <Trash2 size={16} />
            {deleting ? "Deleting…" : "Delete quiz"}
          </Button>
        </div>
      </Dialog>
      {toast && (
        <Toast
          key={toast.id}
          id={toast.id}
          message={toast.message}
          onDismiss={dismissToast}
        />
      )}
    </div>
  );
}
function Empty({
  title,
  text,
  action,
  label,
}: {
  title: string;
  text: string;
  action: () => void;
  label: string;
}) {
  return (
    <div className="panel empty-state">
      <Compass size={36} />
      <h2>{title}</h2>
      <p>{text}</p>
      <Button onClick={action}>
        {label}
        <ArrowRight size={16} />
      </Button>
    </div>
  );
}
function formatHistoryDuration(milliseconds: number) {
  const minutes = Math.max(0, Math.floor(milliseconds / 60000));
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}
function streak(attempts: Library["attempts"]) {
  const days = [
    ...new Set(
      attempts.map((a) => new Date(a.submitted).toLocaleDateString("en-CA")),
    ),
  ]
    .sort()
    .reverse();
  if (!days.length) return 0;
  const today = new Date().toLocaleDateString("en-CA");
  if (
    Math.round(
      (new Date(today).getTime() - new Date(days[0]).getTime()) / 86400000,
    ) > 1
  )
    return 0;
  let count = 1;
  for (let i = 1; i < days.length; i++) {
    if (
      Math.round(
        (new Date(days[i - 1]).getTime() - new Date(days[i]).getTime()) /
          86400000,
      ) === 1
    )
      count++;
    else break;
  }
  return count;
}
