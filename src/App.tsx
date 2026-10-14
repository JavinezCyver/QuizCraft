import { useEffect, useState } from "react";
import {
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
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
  Lightbulb,
  LogOut,
  Menu,
  Moon,
  Plus,
  Search,
  Settings,
  ShieldCheck,
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
  Flag,
  Clock,
  Trash2,
  Layers,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Button } from "./components/ui/button";
import { Select } from "./components/ui/select";
import { Dialog } from "./components/ui/dialog";
import { Studio } from "./components/Studio";
import { Player } from "./components/Player";
import { Flashcards } from "./components/Flashcards";
import { api, share, type Quiz, type User, type Library } from "./lib/api";
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
function Illustration() {
  return (
    <div className="hero-illustration" aria-hidden="true">
      <div className="orbit orbit-one" />
      <div className="orbit orbit-two" />
      <span className="hero-spark spark-one">✦</span>
      <span className="hero-spark spark-two">✧</span>
      <span className="hero-spark spark-three">+</span>
      <div className="floating-bubble bubble-light">
        <Lightbulb size={24} />
      </div>
      <div className="floating-bubble bubble-check">
        <Check size={22} />
      </div>
      <div className="floating-bubble bubble-zap">
        <Zap size={22} />
      </div>
      <div className="back-paper" />
      <div className="quiz-paper">
        <div className="paper-title">
          <span className="paper-icon">
            <Sparkles size={16} />
          </span>
          <span>THE CURIOSITY QUIZ</span>
          <span>•••</span>
        </div>
        <div className="paper-rule" />
        <h3>
          Ready for a little
          <br />
          brain adventure?
        </h3>
        <div className="paper-option">
          <span>A</span> Learn something new
        </div>
        <div className="paper-option selected">
          <span>B</span> Challenge yourself <Check size={14} />
        </div>
        <div className="paper-option">
          <span>C</span> All of the above
        </div>
        <div className="paper-bottom">
          <div>
            <i />
            <i />
            <i />
            <i />
          </div>
          <span>
            Let’s go <ArrowRight size={13} />
          </span>
        </div>
      </div>
      <div className="floating-score">
        <div>
          <Trophy size={20} />
        </div>
        <span>
          That’s a great start!<b>Curiosity level: 100%</b>
        </span>
        <span>✦</span>
      </div>
    </div>
  );
}
function QuizCard({
  quiz,
  onOpen,
  onSave,
  saved,
  onEdit,
  onFlashcards,
}: {
  quiz: Quiz;
  onOpen: () => void;
  onSave: () => void;
  saved: boolean;
  onEdit?: () => void;
  onFlashcards?: () => void;
}) {
  const Icon = categoryIcons[quiz.category] || BookOpen;
  return (
    <article className="quiz-card">
      <button
        className={`quiz-cover cover-${quiz.theme}`}
        onClick={onOpen}
        tabIndex={-1}
        aria-label={`Open ${quiz.title}`}
        style={quiz.cover ? { backgroundImage: `url(${quiz.cover})` } : {}}
      >
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
          <span className={`difficulty ${quiz.difficulty.toLowerCase()}`}>
            {quiz.difficulty}
          </span>
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
        {(onEdit || onFlashcards) && (
          <div className="card-actions">
            {onEdit && (
              <button className="text-link" onClick={onEdit}>
                <Pencil size={14} /> Edit quiz
              </button>
            )}
            {onFlashcards && (
              <button className="text-link" onClick={onFlashcards}>
                <Layers size={14} /> Flashcards
              </button>
            )}
          </div>
        )}
      </div>
    </article>
  );
}
export default function App() {
  const [view, setView] = useState("home"),
    [quizzes, setQuizzes] = useState<Quiz[]>([]),
    [user, setUser] = useState<User | null>(null),
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
    [difficulty, setDifficulty] = useState("All levels"),
    [sort, setSort] = useState("popular"),
    [showAll, setShowAll] = useState(false),
    [authOpen, setAuthOpen] = useState(false),
    [authMode, setAuthMode] = useState("login"),
    [authError, setAuthError] = useState(""),
    [busy, setBusy] = useState(false),
    [toast, setToast] = useState(""),
    [mobile, setMobile] = useState(false),
    [dark, setDark] = useState(
      localStorage.getItem("quizcraft-theme") === "dark",
    ),
    [activeQuiz, setActiveQuiz] = useState<Quiz | null>(null),
    [quizReturnView, setQuizReturnView] = useState("home"),
    [editId, setEditId] = useState(""),
    [profile, setProfile] = useState(false),
    [report, setReport] = useState<Quiz | null>(null),
    [deleteTarget, setDeleteTarget] = useState<Quiz | null>(null),
    [deleting, setDeleting] = useState(false),
    [deleteError, setDeleteError] = useState(""),
    [admin, setAdmin] = useState<any>(null),
    [grading, setGrading] = useState<any[]>([]);
  const notify = (message: string) => {
    setToast(message);
    setTimeout(() => setToast(""), 4500);
  };
  const refreshLibrary = () =>
    api<Library>("/library")
      .then(setLibrary)
      .catch(() => {});
  async function load() {
    setLoading(true);
    setLoadError("");
    try {
      const [q, u] = await Promise.all([
        api<Quiz[]>("/quizzes"),
        api<User | null>("/me"),
      ]);
      setQuizzes(q);
      setUser(u);
      if (u) await refreshLibrary();
      const id = new URLSearchParams(location.search).get("quiz");
      if (id) {
        const selected = await api<Quiz>("/quizzes/" + id);
        setActiveQuiz(selected);
        const previousView = window.history.state?.quizReturnView;
        setQuizReturnView(
          navItems.some((item) => item.id === previousView)
            ? previousView
            : selected.owner === u?.id
              ? "quizzes"
              : "home",
        );
        setView("take");
      }
    } catch (e) {
      setLoadError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void load();
    const token = new URLSearchParams(location.search).get("reset");
    if (token) {
      setAuthMode("reset");
      setAuthOpen(true);
    }
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
    if (next !== "home" && !user) {
      setAuthMode("login");
      setAuthOpen(true);
      return;
    }
    setView(next);
    setMobile(false);
    setSearch("");
    setCategory("All topics");
    window.history.replaceState({}, "", location.pathname);
    window.scrollTo({ top: 0, behavior: "smooth" });
    if (user) void refreshLibrary();
    if (next === "admin")
      api("/admin")
        .then(setAdmin)
        .catch((e) => notify(e.message));
    if (next === "quizzes")
      api("/grading")
        .then(setGrading)
        .catch(() => {});
  }
  async function createQuiz() {
    if (!user) {
      setAuthMode("register");
      setAuthOpen(true);
      return;
    }
    try {
      const q = await api<{ id: string }>("/quizzes", "POST", {});
      setEditId(q.id);
      setView("studio");
    } catch (e) {
      notify((e as Error).message);
    }
  }
  async function saveQuiz(q: Quiz) {
    if (!user) {
      setAuthMode("login");
      setAuthOpen(true);
      return;
    }
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
      setQuizReturnView(view);
      setView("take");
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
  async function authenticate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setAuthError("");
    const data = Object.fromEntries(new FormData(event.currentTarget));
    try {
      if (authMode === "forgot") {
        await api("/auth/forgot", "POST", data);
        notify("If that email is registered, a reset link is on its way.");
        setAuthOpen(false);
      } else if (authMode === "reset") {
        await api("/auth/reset", "POST", {
          ...data,
          token: new URLSearchParams(location.search).get("reset"),
        });
        notify("Password reset. Sign in with your new password.");
        setAuthMode("login");
        window.history.replaceState({}, "", location.pathname);
      } else {
        const u = await api<User>(
          "/auth/" + (authMode === "register" ? "register" : "login"),
          "POST",
          data,
        );
        setUser(u);
        setAuthOpen(false);
        await refreshLibrary();
        notify(
          authMode === "register"
            ? "Welcome to QuizCraft! Let’s make something great."
            : "Welcome back, " + u.name + ".",
        );
      }
    } catch (e) {
      setAuthError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const filtered = quizzes
    .filter(
      (q) =>
        (category === "All topics" || q.category === category) &&
        (difficulty === "All levels" || q.difficulty === difficulty) &&
        `${q.title} ${q.description} ${q.category} ${q.creator}`
          .toLowerCase()
          .includes(search.toLowerCase()),
    )
    .sort((a, b) =>
      sort === "newest"
        ? String(b.created).localeCompare(String(a.created))
        : (b.plays || 0) - (a.plays || 0),
    );
  const explore = () => {
    setShowAll(true);
    if (view !== "home") setView("home");
    setTimeout(
      () =>
        document
          .getElementById("explore")
          ?.scrollIntoView({ behavior: "smooth", block: "start" }),
      50,
    );
  };
  const discoverCategories = Array.from(
    new Set(quizzes.map((q) => q.category)),
  ).sort((a, b) => a.localeCompare(b));
  const categories = Array.from(
    new Set(library.quizzes.map((q) => q.category)),
  ).sort((a, b) => a.localeCompare(b));
  const studyQuizzes = library.quizzes
    .filter(
      (q) =>
        (studyCategory === "All categories" || q.category === studyCategory) &&
        (!["draft", "published"].includes(sort) || q.status === sort),
    )
    .sort((a, b) =>
      studySort === "category"
        ? a.category.localeCompare(b.category) || a.title.localeCompare(b.title)
        : String(b.created || "").localeCompare(String(a.created || "")),
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
          onFlashcards={
            editable || library.quizzes.some((owned) => owned.id === q.id)
              ? () => {
                  setActiveQuiz(q);
                  setView("flashcards");
                }
              : undefined
          }
          onEdit={
            editable
              ? () => {
                  setEditId(q.id);
                  setView("studio");
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
  const showCreateQuiz = !["dashboard", "bookmarks", "history"].includes(view);
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
          onClick={() => (user ? setProfile(true) : setAuthOpen(true))}
        >
          <Settings size={19} />
          <span>Settings</span>
        </button>
        {user?.admin && (
          <button className="nav-item" onClick={() => navigate("admin")}>
            <ShieldCheck size={19} />
            <span>Administration</span>
          </button>
        )}
        <div className="sidebar-bottom">
          {showCreateQuiz && (
            <div className="create-callout">
              <span className="callout-icon">
                <Sparkles size={20} />
              </span>
              <h3>Got a great question?</h3>
              <p>
                Turn what you know into
                <br />
                something worth sharing.
              </p>
              <Button size="sm" onClick={createQuiz}>
                <Plus size={16} /> Create a quiz
              </Button>
            </div>
          )}
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
            <button
              onClick={() => (user ? setProfile(true) : setAuthOpen(true))}
            >
              <b>{user?.name || "Hello, curious mind"}</b>
              <span>
                {user ? "Personal account" : "Your next discovery awaits"}
              </span>
            </button>
            {user ? (
              <button
                className="icon-btn"
                aria-label="Log out"
                onClick={async () => {
                  await api("/auth/logout", "POST");
                  setUser(null);
                  setLibrary({ quizzes: [], bookmarks: [], attempts: [] });
                  setView("home");
                  notify("You have been signed out.");
                }}
              >
                <LogOut size={17} />
              </button>
            ) : (
              <ChevronRight size={16} />
            )}
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
              <span /> A world of curious minds
            </span>
            {user ? (
              <button
                className="header-avatar"
                onClick={() => setProfile(true)}
                aria-label="Open profile"
              >
                {user.name[0]}
              </button>
            ) : (
              <button
                className="sign-in"
                onClick={() => {
                  setAuthMode("login");
                  setAuthOpen(true);
                }}
              >
                Log in
              </button>
            )}
            {showCreateQuiz && view !== "quizzes" && (
              <Button size="sm" onClick={createQuiz} aria-label="Create a Quiz">
                <Plus size={16} />
                <span className="create-label-full">Create a Quiz</span>
                <span className="create-label-mobile">Create</span>
              </Button>
            )}
          </div>
        </header>
        <main>
          {view === "studio" ? (
            <Studio
              key={editId}
              id={editId}
              onBack={() => {
                navigate("quizzes");
                void load();
              }}
              onPreview={(q) => {
                setQuizReturnView("quizzes");
                setActiveQuiz({
                  ...q,
                  questionCount: q.questions?.length || 0,
                });
                setView("take");
              }}
              notify={notify}
            />
          ) : view === "flashcards" && activeQuiz ? (
            <>
              {cards(studyQuizzes, true)}
              <Flashcards
                key={activeQuiz.id}
                quizId={activeQuiz.id}
                onBack={() => navigate("quizzes")}
                onEdit={() => {
                  setEditId(activeQuiz.id);
                  setView("studio");
                }}
              />
            </>
          ) : view === "take" && activeQuiz ? (
            <>
              <Player
                key={activeQuiz.id}
                quiz={activeQuiz}
                onBack={() => navigate(quizReturnView)}
                backLabel={
                  quizReturnView === "home"
                    ? "Back to quiz library"
                    : `Back to ${navItems.find((item) => item.id === quizReturnView)?.label.toLowerCase() || "my quizzes"}`
                }
                onDone={refreshLibrary}
                notify={notify}
              />
              <div className="quiz-tools">
                <button
                  className="text-link"
                  onClick={() =>
                    navigator.clipboard
                      .writeText(share(activeQuiz.id))
                      .then(() => notify("Quiz link copied."))
                      .catch(() => notify("Could not copy the link."))
                  }
                >
                  <Copy size={15} /> Copy quiz link
                </button>
                <button
                  className="text-link muted"
                  onClick={() =>
                    user ? setReport(activeQuiz) : setAuthOpen(true)
                  }
                >
                  <Flag size={15} /> Report quiz
                </button>
                {user?.id === activeQuiz.owner && (
                  <button
                    className="text-link"
                    onClick={() => {
                      setEditId(activeQuiz.id);
                      setView("studio");
                    }}
                  >
                    <Pencil size={15} /> Back to editor
                  </button>
                )}
              </div>
            </>
          ) : view === "home" ? (
            <>
              <div className="welcome-line">
                <span>
                  <span className="tiny-spark">✦</span> A LITTLE CURIOSITY.
                  ENDLESS POSSIBILITIES.
                </span>
                <span>Learn something new today.</span>
              </div>
              <section className="hero">
                <div className="hero-copy">
                  <span className="hero-label">
                    <span /> BIG IDEAS START WITH A QUESTION
                  </span>
                  <h1>
                    Create. Share.
                    <br />
                    <span>Challenge Yourself.</span>
                  </h1>
                  <p>
                    Share what you know. Discover what you don’t.
                    <br />
                    Make a quiz, find your next challenge, and keep growing.
                  </p>
                  <div className="button-row">
                    <Button onClick={createQuiz}>
                      <Plus size={18} /> Create a Quiz
                      <ArrowUpRight size={17} />
                    </Button>
                    <Button variant="outline" onClick={explore}>
                      Explore Quizzes
                      <ArrowRight size={17} />
                    </Button>
                  </div>
                  <div className="hero-social">
                    <div className="avatar-stack">
                      <span>A</span>
                      <span>J</span>
                      <span>M</span>
                      <span>K</span>
                    </div>
                    <div>
                      <span className="star-rating">★★★★★</span>
                      <span>Made for curious minds like yours</span>
                    </div>
                  </div>
                </div>
                <Illustration />
              </section>
              <div className="value-strip">
                <div>
                  <span className="value-icon lavender">
                    <BookOpen size={20} />
                  </span>
                  <span>
                    <b>A world to discover</b>
                    <small>Fresh perspectives, every topic</small>
                  </span>
                </div>
                <div>
                  <span className="value-icon peach">
                    <Users size={20} />
                  </span>
                  <span>
                    <b>Better when shared</b>
                    <small>Learn together, grow together</small>
                  </span>
                </div>
                <div>
                  <span className="value-icon mint">
                    <Zap size={20} />
                  </span>
                  <span>
                    <b>Your pace. Your challenge.</b>
                    <small>A little brain workout, anytime</small>
                  </span>
                </div>
              </div>
              <section id="explore" className="explore-section">
                <div className="section-heading">
                  <div>
                    <span className="eyebrow">FOLLOW YOUR CURIOSITY</span>
                    <h2>
                      What will you discover today? <span>✦</span>
                    </h2>
                    <p>
                      A new topic, a friendly challenge, or your next “aha!”
                      moment.
                    </p>
                  </div>
                  <button
                    className="text-link"
                    onClick={() => {
                      setCategory("All topics");
                      setSearch("");
                      setDifficulty("All levels");
                      setShowAll(true);
                    }}
                  >
                    View all quizzes
                    <ArrowRight size={16} />
                  </button>
                </div>
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
                  <label className="select-control">
                    <span className="sr-only">Difficulty</span>
                    <Select
                      label="Difficulty"
                      value={difficulty}
                      onChange={setDifficulty}
                      options={[
                        "All levels",
                        "Easy",
                        "Intermediate",
                        "Advanced",
                      ].map((value) => ({ value, label: value }))}
                    />
                  </label>
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
                  cards(
                    filtered.slice(0, showAll || search ? filtered.length : 6),
                  )
                ) : !quizzes.length ? (
                  <Empty
                    title="No quizzes published yet"
                    text="Publish a public quiz to share it with the community. Your drafts stay in My quizzes."
                    action={createQuiz}
                    label="Create a quiz"
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
                        setDifficulty("All levels");
                      }}
                    >
                      Clear filters
                    </Button>
                  </div>
                )}
              </section>
              <section className="recent-section">
                <div className="section-heading">
                  <div>
                    <span className="eyebrow">FRESH OFF THE PRESS</span>
                    <h2>New questions. New possibilities.</h2>
                  </div>
                  <button
                    className="text-link"
                    onClick={() => {
                      setSort("newest");
                      explore();
                    }}
                  >
                    See what’s new
                    <ArrowRight size={16} />
                  </button>
                </div>
                <div className="recent-grid">
                  {[...quizzes]
                    .sort((a, b) =>
                      String(b.created).localeCompare(String(a.created)),
                    )
                    .slice(0, 3)
                    .map((q) => {
                      const Icon = categoryIcons[q.category] || BookOpen;
                      return (
                        <button
                          className="recent-card"
                          key={q.id}
                          onClick={() => openQuiz(q)}
                        >
                          <span className={`recent-icon cover-${q.theme}`}>
                            <Icon size={25} />
                          </span>
                          <span>
                            <small>
                              {q.category} ·{" "}
                              {q.demo ? "Demo quiz" : "Just published"}
                            </small>
                            <b>{q.title}</b>
                            <span>
                              {q.questionCount} questions <span>·</span>{" "}
                              {q.difficulty}
                            </span>
                          </span>
                          <ArrowUpRight size={18} />
                        </button>
                      );
                    })}
                </div>
              </section>
              <section className="how-it-works">
                <div className="how-intro">
                  <span className="eyebrow">FROM “WHAT IF” TO “WELL DONE”</span>
                  <h2>
                    Good questions.
                    <br />
                    Great possibilities.
                  </h2>
                  <p>A spark of curiosity is all you need.</p>
                  <button className="text-link" onClick={createQuiz}>
                    Make your first quiz
                    <ArrowRight size={16} />
                  </button>
                </div>
                {[
                  {
                    n: "01",
                    icon: Pencil,
                    title: "Create something great",
                    text: "Bring your knowledge to life with our easy-to-use quiz studio.",
                  },
                  {
                    n: "02",
                    icon: ShareIcon,
                    title: "Pass the curiosity on",
                    text: "Share a link with friends, your class, or the whole world.",
                  },
                  {
                    n: "03",
                    icon: Trophy,
                    title: "Challenge. Learn. Repeat.",
                    text: "Test your knowledge and celebrate every little discovery.",
                  },
                ].map(({ n, icon: Icon, title, text }) => (
                  <div className="how-step" key={n}>
                    <div>
                      <span>{n}</span>
                      <Icon size={20} />
                    </div>
                    <h3>{title}</h3>
                    <p>{text}</p>
                  </div>
                ))}
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
          ) : view === "admin" ? (
            <>
              <div className="page-title">
                <span className="eyebrow">PLATFORM HEALTH</span>
                <h1>Administration</h1>
                <p>Review reports and keep the community welcoming.</p>
              </div>
              {admin ? (
                <>
                  <div className="stats-grid">
                    {[
                      ["Users", admin.users],
                      ["Quizzes", admin.quizzes],
                      ["Attempts", admin.attempts],
                    ].map(([label, n]) => (
                      <div className="panel stat" key={label}>
                        <span>{label}</span>
                        <strong>{n}</strong>
                      </div>
                    ))}
                  </div>
                  <section className="panel">
                    <h2>Content reports</h2>
                    {admin.reports.length ? (
                      admin.reports.map((r: any) => (
                        <div className="activity-row" key={r.id}>
                          <div>
                            <b>{r.title}</b>
                            <p>{r.reason}</p>
                            <small>{r.status}</small>
                          </div>
                          {r.status === "open" && (
                            <div className="button-row">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={async () => {
                                  await api(
                                    "/admin/reports/" + r.id,
                                    "PATCH",
                                    {},
                                  );
                                  setAdmin(await api("/admin"));
                                }}
                              >
                                Resolve
                              </Button>
                              <Button
                                size="sm"
                                onClick={async () => {
                                  await api("/admin/reports/" + r.id, "PATCH", {
                                    hide: true,
                                  });
                                  setAdmin(await api("/admin"));
                                  notify("Quiz hidden and report resolved.");
                                }}
                              >
                                Hide quiz
                              </Button>
                            </div>
                          )}
                        </div>
                      ))
                    ) : (
                      <p>No reports to review.</p>
                    )}
                  </section>
                </>
              ) : (
                <p>Loading moderation tools…</p>
              )}
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
                      {studyQuizzes.length === 1 ? "quiz" : "quizzes"} · Open
                      Flashcards to study
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
                      Published
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
                  {studyQuizzes.map((q) => (
                    <div className="quiz-manage-row" key={q.id}>
                      <b>{q.title}</b>
                      <span className="pill">{q.visibility}</span>
                      <button
                        className="text-link"
                        onClick={() =>
                          navigator.clipboard
                            .writeText(share(q.id))
                            .then(() => notify("Quiz link copied."))
                        }
                      >
                        <Copy size={14} /> Copy link
                      </button>
                      <button
                        className="text-link"
                        onClick={async () => {
                          const copy = await api(
                            "/quizzes/" + q.id + "/duplicate",
                            "POST",
                          );
                          setEditId(copy.id);
                          setView("studio");
                        }}
                      >
                        <Copy size={14} /> Duplicate
                      </button>
                      <button
                        className="text-link danger"
                        onClick={() => {
                          setDeleteError("");
                          setDeleteTarget(q);
                        }}
                      >
                        <Trash2 size={14} /> Delete
                      </button>
                    </div>
                  ))}
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
                            {a.pending
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
                          {Math.round((a.submitted - a.started) / 1000)}s
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
        open={authOpen}
        onOpenChange={setAuthOpen}
        title={
          authMode === "register"
            ? "Let curiosity lead the way"
            : authMode === "forgot"
              ? "Find your way back"
              : authMode === "reset"
                ? "A fresh start"
                : "Welcome back, curious mind"
        }
      >
        <p className="dialog-subtitle">
          {authMode === "register"
            ? "Create an account to make quizzes and keep your discoveries."
            : authMode === "forgot"
              ? "We’ll email you a link to reset your password."
              : "Your next “aha!” moment is waiting."}
        </p>
        <form onSubmit={authenticate}>
          {authMode === "register" && (
            <label>
              Your name
              <input
                name="name"
                required
                maxLength={80}
                autoComplete="name"
                placeholder="Alex Taylor"
              />
            </label>
          )}
          {authMode !== "reset" && (
            <label>
              Email address
              <input
                name="email"
                type="email"
                required
                autoComplete="email"
                placeholder="you@example.com"
              />
            </label>
          )}
          {authMode !== "forgot" && (
            <label>
              Password
              <input
                name="password"
                type="password"
                required
                minLength={authMode === "login" ? 1 : 10}
                autoComplete={
                  authMode === "login" ? "current-password" : "new-password"
                }
                placeholder={
                  authMode === "register"
                    ? "At least 10 characters"
                    : "Your password"
                }
              />
            </label>
          )}
          {authError && (
            <div className="alert" role="alert">
              {authError}
            </div>
          )}
          <Button disabled={busy} className="full-width">
            {busy
              ? "One moment…"
              : authMode === "register"
                ? "Create account"
                : authMode === "forgot"
                  ? "Send reset link"
                  : authMode === "reset"
                    ? "Reset password"
                    : "Log in"}
            <ArrowRight size={17} />
          </Button>
          {authMode === "login" && (
            <button
              type="button"
              className="text-link centered"
              onClick={() => {
                setAuthMode("forgot");
                setAuthError("");
              }}
            >
              Forgot your password?
            </button>
          )}
          <div className="auth-switch">
            {authMode === "register"
              ? "Already have an account?"
              : "New to QuizCraft?"}{" "}
            <button
              type="button"
              className="text-link"
              onClick={() => {
                setAuthMode(authMode === "register" ? "login" : "register");
                setAuthError("");
              }}
            >
              {authMode === "register" ? "Log in" : "Join the curiosity"}
            </button>
          </div>
        </form>
      </Dialog>
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
              notify("Your profile has been updated.");
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
          <label>
            Profile picture URL
            <input
              name="avatar"
              type="url"
              placeholder="https://…"
              defaultValue={user?.avatar}
            />
          </label>
          <label>
            Email
            <input value={user?.email || ""} readOnly />
          </label>
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
          <Button disabled={busy}>
            Save profile
            <Check size={16} />
          </Button>
        </form>
      </Dialog>
      <Dialog
        open={!!report}
        onOpenChange={(v) => !v && setReport(null)}
        title="Help keep QuizCraft welcoming"
      >
        <p>Report “{report?.title}” for review by the moderation team.</p>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            try {
              await api("/reports", "POST", {
                quizId: report?.id,
                reason: new FormData(e.currentTarget).get("reason"),
              });
              setReport(null);
              notify("Report received. Thank you for helping.");
            } catch (e) {
              notify((e as Error).message);
            }
          }}
        >
          <label>
            What should we know?
            <textarea
              name="reason"
              required
              maxLength={2000}
              placeholder="Describe your concern…"
            />
          </label>
          <Button>Submit report</Button>
        </form>
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
          and saved collections. Its share link will stop working. Attempts for
          this quiz will also be removed from quiz history.
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
        <div className="toast" role="status">
          <span>
            <Check size={17} />
          </span>
          {toast}
          <button
            className="icon-btn"
            aria-label="Dismiss notification"
            onClick={() => setToast("")}
          >
            <X size={16} />
          </button>
        </div>
      )}
    </div>
  );
}
function ShareIcon(props: React.ComponentProps<typeof ArrowUpRight>) {
  return <ArrowUpRight {...props} />;
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
