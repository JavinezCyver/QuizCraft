import express from "express";
import {
  randomBytes,
  randomUUID,
  scryptSync,
  timingSafeEqual,
  createHash,
} from "node:crypto";
import { resolve } from "node:path";
import { existsSync } from "node:fs";
import { db, all, get, run } from "./db.mjs";
import { seed } from "./seed.mjs";
import { grade, shuffle } from "./scoring.mjs";
import { isAllowedOrigin } from "./origin.mjs";
seed();
const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "2mb" }));
const hash = (t) => createHash("sha256").update(t).digest("hex");
const secret = () => randomBytes(32).toString("hex");
const publicUser = (u) =>
  u
    ? {
        id: u.id,
        name: u.name,
        email: u.email,
        avatar: u.avatar,
        admin: !!u.admin,
      }
    : null;
const parse = (q) => ({
  ...q,
  settings: JSON.parse(q.settings || "{}"),
  questions: undefined,
});
const attemptQuestions = (a) =>
  JSON.parse(a.question_order)
    .map((id) => get("SELECT * FROM questions WHERE id=?", id))
    .map((q) => ({
      ...q,
      options: JSON.parse(q.options),
      accepted: JSON.parse(q.accepted),
    }));
const questions = (id) =>
  all(
    "SELECT * FROM questions WHERE quiz_id=? AND active=1 ORDER BY position",
    id,
  ).map((q) => ({
    ...q,
    options: JSON.parse(q.options),
    accepted: JSON.parse(q.accepted),
  }));
const auth = (req, res, next) => {
  if (!req.user)
    return res.status(401).json({ error: "Please sign in to continue." });
  next();
};
const owner = (req, q) => req.user?.id === q.owner;
const readable = (req, q) =>
  q &&
  q.status !== "deleted" &&
  ((q.status === "published" && q.visibility !== "private") || owner(req, q));
app.use((req, res, next) => {
  res.set("X-Content-Type-Options", "nosniff");
  res.set("Referrer-Policy", "same-origin");
  if (
    req.method !== "GET" &&
    !isAllowedOrigin(req.headers.origin, {
      protocol: req.protocol,
      host: req.get("host"),
      appOrigin: process.env.APP_ORIGIN,
      production: process.env.NODE_ENV === "production",
    })
  )
    return res.status(403).json({ error: "Origin not allowed." });
  const cookies = Object.fromEntries(
    (req.headers.cookie || "")
      .split(";")
      .filter((x) => x.includes("="))
      .map((x) => x.trim().split("=")),
  );
  req.session = cookies.qc;
  req.user = req.session
    ? get(
        "SELECT u.* FROM users u JOIN sessions s ON s.user_id=u.id WHERE s.token=? AND s.expires>?",
        hash(req.session),
        Date.now(),
      )
    : null;
  next();
});
const attemptsByIP = new Map();
app.use("/api/auth", (req, res, next) => {
  const key = req.ip;
  const bucket = attemptsByIP.get(key) || {
    count: 0,
    until: Date.now() + 900000,
  };
  if (bucket.until < Date.now()) {
    bucket.count = 0;
    bucket.until = Date.now() + 900000;
  }
  bucket.count++;
  attemptsByIP.set(key, bucket);
  if (bucket.count > 60)
    return res
      .status(429)
      .json({ error: "Too many requests. Try again in 15 minutes." });
  next();
});
function session(res, id) {
  const token = secret();
  run(
    "INSERT INTO sessions VALUES(?,?,?)",
    hash(token),
    id,
    Date.now() + 604800000,
  );
  res.cookie("qc", token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 604800000,
  });
}
app.get("/api/me", (req, res) => res.json(publicUser(req.user)));
app.post("/api/auth/register", (req, res) => {
  const { email, password, name } = req.body;
  if (
    !/^\S+@\S+\.\S+$/.test(email || "") ||
    !name?.trim() ||
    !password ||
    password.length < 10 ||
    password.length > 256
  )
    return res.status(400).json({
      error:
        "Enter a name, valid email, and password between 10 and 256 characters.",
    });
  const salt = secret();
  try {
    const id = randomUUID();
    run(
      "INSERT INTO users(id,email,password,name,admin) VALUES(?,?,?,?,?)",
      id,
      email.toLowerCase().trim(),
      salt + ":" + scryptSync(password, salt, 64).toString("hex"),
      name.trim().slice(0, 80),
      0,
    );
    session(res, id);
    res.json(publicUser(get("SELECT * FROM users WHERE id=?", id)));
  } catch {
    res.status(409).json({ error: "This email is already registered." });
  }
});
app.post("/api/auth/login", (req, res) => {
  const u = get(
    "SELECT * FROM users WHERE email=?",
    String(req.body.email).toLowerCase().trim(),
  );
  const [salt, key] = (u?.password || ":").split(":");
  if (
    !u ||
    !timingSafeEqual(
      scryptSync(String(req.body.password), salt, 64),
      Buffer.from(key, "hex"),
    )
  )
    return res.status(401).json({ error: "Email or password is incorrect." });
  session(res, u.id);
  res.json(publicUser(u));
});
app.post("/api/auth/logout", (req, res) => {
  if (req.session) run("DELETE FROM sessions WHERE token=?", hash(req.session));
  res.clearCookie("qc");
  res.json({ ok: true });
});
app.post("/api/auth/forgot", async (req, res) => {
  if (!process.env.EMAIL_WEBHOOK_URL)
    return res.status(503).json({
      error:
        "Password reset email is not configured. Contact the site administrator.",
    });
  const u = get(
    "SELECT * FROM users WHERE email=?",
    String(req.body.email).toLowerCase().trim(),
  );
  if (u) {
    const token = secret();
    run(
      "INSERT INTO resets VALUES(?,?,?)",
      hash(token),
      u.id,
      Date.now() + 3600000,
    );
    const delivery = await fetch(process.env.EMAIL_WEBHOOK_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.EMAIL_WEBHOOK_TOKEN || ""}`,
      },
      body: JSON.stringify({
        to: u.email,
        subject: "Reset your QuizCraft password",
        url: `${process.env.APP_ORIGIN}/?reset=${token}`,
      }),
    });
    if (!delivery.ok)
      return res
        .status(502)
        .json({ error: "Email delivery failed. Please try again." });
  }
  res.json({ ok: true });
});
app.post("/api/auth/reset", (req, res) => {
  const r = get(
    "SELECT * FROM resets WHERE token=? AND expires>?",
    hash(String(req.body.token)),
    Date.now(),
  );
  if (
    !r ||
    !req.body.password ||
    req.body.password.length < 10 ||
    req.body.password.length > 256
  )
    return res.status(400).json({
      error:
        "Invalid or expired link, or password is shorter than 10 characters.",
    });
  const salt = secret();
  run(
    "UPDATE users SET password=? WHERE id=?",
    salt + ":" + scryptSync(req.body.password, salt, 64).toString("hex"),
    r.user_id,
  );
  run("DELETE FROM resets WHERE user_id=?", r.user_id);
  run("DELETE FROM sessions WHERE user_id=?", r.user_id);
  res.json({ ok: true });
});
app.patch("/api/profile", auth, (req, res) => {
  const { name, avatar } = req.body;
  if (
    !name?.trim() ||
    name.length > 80 ||
    (avatar && !/^https:\/\//.test(avatar))
  )
    return res.status(400).json({
      error: "Use a name up to 80 characters and an HTTPS avatar URL.",
    });
  run(
    "UPDATE users SET name=?,avatar=? WHERE id=?",
    name.trim(),
    avatar || "",
    req.user.id,
  );
  res.json(publicUser(get("SELECT * FROM users WHERE id=?", req.user.id)));
});
app.get("/api/quizzes", (req, res) =>
  res.json(
    all(
      `SELECT q.*,COALESCE(u.name,'QuizCraft Studio') creator,(SELECT COUNT(*) FROM questions WHERE quiz_id=q.id AND active=1) questionCount,(SELECT COUNT(*) FROM attempts WHERE quiz_id=q.id AND submitted IS NOT NULL AND preview=0) plays FROM quizzes q LEFT JOIN users u ON q.owner=u.id WHERE q.status='published' AND q.visibility='public' ORDER BY q.created DESC`,
    ).map(parse),
  ),
);
app.get("/api/library", auth, (req, res) =>
  res.json({
    quizzes: all(
      "SELECT q.*,(SELECT COUNT(*) FROM questions WHERE quiz_id=q.id AND active=1) questionCount,(SELECT COUNT(*) FROM attempts WHERE quiz_id=q.id AND submitted IS NOT NULL AND preview=0) plays FROM quizzes q WHERE owner=? AND status!='deleted' ORDER BY created DESC",
      req.user.id,
    ).map(parse),
    bookmarks: all(
      "SELECT quiz_id FROM bookmarks WHERE user_id=?",
      req.user.id,
    ).map((b) => b.quiz_id),
    saved: all(
      "SELECT q.*,COALESCE(u.name,'QuizCraft Studio') creator,(SELECT COUNT(*) FROM questions WHERE quiz_id=q.id AND active=1) questionCount FROM quizzes q JOIN bookmarks b ON b.quiz_id=q.id LEFT JOIN users u ON u.id=q.owner WHERE b.user_id=? AND ((q.status='published' AND q.visibility!='private') OR q.owner=?)",
      req.user.id,
      req.user.id,
    ).map(parse),
    attempts: all(
      "SELECT a.id,a.quiz_id,a.name,a.score,a.maximum,a.correct,a.submitted,a.started,a.pending,q.title FROM attempts a JOIN quizzes q ON q.id=a.quiz_id WHERE user_id=? AND submitted IS NOT NULL AND preview=0 ORDER BY submitted DESC",
      req.user.id,
    ),
  }),
);
app.get("/api/quizzes/:id", (req, res) => {
  const q = get(
    "SELECT q.*,COALESCE(u.name,'QuizCraft Studio') creator FROM quizzes q LEFT JOIN users u ON u.id=q.owner WHERE q.id=?",
    req.params.id,
  );
  if (!readable(req, q))
    return res.status(404).json({ error: "Quiz not found or access denied." });
  res.json({
    ...parse(q),
    questionCount: questions(q.id).length,
    ...(owner(req, q) ? { questions: questions(q.id) } : {}),
  });
});
function validate(q, publish) {
  if (typeof q.title !== "string" || !q.title.trim() || q.title.length > 140)
    return "A quiz title is required (up to 140 characters).";
  if (
    ![
      "Education",
      "Science",
      "Mathematics",
      "Technology",
      "History",
      "Entertainment",
      "General Knowledge",
    ].includes(q.category)
  )
    return "Choose a category.";
  if (!["public", "unlisted", "private"].includes(q.visibility))
    return "Choose a valid visibility.";
  if (!["Easy", "Intermediate", "Advanced"].includes(q.difficulty))
    return "Choose a valid difficulty.";
  if (
    !q.settings ||
    !Number.isFinite(Number(q.settings.time)) ||
    Number(q.settings.time) < 0 ||
    Number(q.settings.time) > 180 ||
    !Number.isFinite(Number(q.settings.passing)) ||
    Number(q.settings.passing) < 0 ||
    Number(q.settings.passing) > 100
  )
    return "Use a time limit from 0 to 180 minutes and passing score from 0 to 100.";
  if (!Array.isArray(q.questions) || q.questions.length > 100)
    return "Use up to 100 questions.";
  if (
    q.questions.some(
      (x) =>
        !x ||
        typeof x.prompt !== "string" ||
        !Array.isArray(x.options) ||
        !Array.isArray(x.accepted) ||
        x.options.some((o) => typeof o !== "string") ||
        x.accepted.some((a) => typeof a !== "string"),
    )
  )
    return "Questions and answers must contain valid text.";
  if (
    publish &&
    (!q.questions.length ||
      q.questions.some(
        (x) =>
          !x.prompt?.trim() ||
          !["multiple", "boolean", "blank", "short"].includes(x.type) ||
          !Number.isInteger(x.points) ||
          x.points < 1 ||
          x.points > 1000 ||
          (["multiple", "boolean"].includes(x.type) &&
            (x.options.length < 2 ||
              x.options.length > 8 ||
              x.options.some((o) => !o.trim()) ||
              new Set(x.options).size !== x.options.length ||
              !x.options.includes(x.accepted?.[0]))) ||
          (x.type !== "short" &&
            (!x.accepted.length || x.accepted.some((a) => !a.trim()))),
      ))
  )
    return "Complete every question, its answer choices, correct answer, and points before publishing.";
  return null;
}
app.post("/api/quizzes", auth, (req, res) => {
  const id = randomUUID();
  run(
    "INSERT INTO quizzes(id,owner,title,description,category,difficulty,theme,cover,settings) VALUES(?,?,?,?,?,?,?,?,?)",
    id,
    req.user.id,
    "Untitled quiz",
    "",
    "General Knowledge",
    "Easy",
    "purple",
    "",
    JSON.stringify({
      guests: true,
      review: true,
      showAnswers: true,
      rankings: true,
      passing: 60,
      time: 0,
      layout: "single",
    }),
  );
  res.json({ id });
});
app.put("/api/quizzes/:id", auth, (req, res) => {
  const old = get("SELECT * FROM quizzes WHERE id=?", req.params.id);
  if (!old || old.status === "deleted")
    return res.status(404).json({ error: "Quiz not found." });
  if (!old || !owner(req, old))
    return res
      .status(403)
      .json({ error: "You can edit only your own quizzes." });
  const q = req.body;
  const error = validate(q, q.status === "published");
  if (error) return res.status(400).json({ error });
  db.exec("BEGIN");
  try {
    run(
      "UPDATE quizzes SET title=?,description=?,category=?,difficulty=?,theme=?,cover=?,visibility=?,status=?,settings=? WHERE id=?",
      q.title,
      q.description || "",
      q.category,
      q.difficulty,
      q.theme || "purple",
      /^https:\/\//.test(q.cover || "") ? q.cover : "",
      q.visibility,
      q.status === "published" ? "published" : "draft",
      JSON.stringify(q.settings || {}),
      old.id,
    );
    run("UPDATE questions SET active=0 WHERE quiz_id=?", old.id);
    q.questions.forEach((x, i) =>
      run(
        "INSERT INTO questions(id,quiz_id,position,type,prompt,options,accepted,explanation,points) VALUES(?,?,?,?,?,?,?,?,?)",
        randomUUID(),
        old.id,
        i,
        x.type,
        x.prompt || "",
        JSON.stringify(x.options || []),
        JSON.stringify(x.accepted || []),
        x.explanation || "",
        Number(x.points) || 10,
      ),
    );
    db.exec("COMMIT");
    res.json({ ok: true });
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
});
app.delete("/api/quizzes/:id", auth, (req, res) => {
  const quiz = get("SELECT * FROM quizzes WHERE id=?", req.params.id);
  if (!quiz || quiz.status === "deleted")
    return res.status(404).json({ error: "Quiz not found." });
  if (!owner(req, quiz))
    return res
      .status(403)
      .json({ error: "You can delete only your own quizzes." });
  // Retain versioned questions and completed scores for participants' history.
  // Removing discoverability and bookmarks also revokes access for the owner.
  db.exec("BEGIN");
  try {
    run(
      "UPDATE quizzes SET status='deleted',visibility='private' WHERE id=?",
      quiz.id,
    );
    run("DELETE FROM bookmarks WHERE quiz_id=?", quiz.id);
    run(
      "UPDATE attempts SET preview=1,public=0 WHERE quiz_id=? AND user_id=?",
      quiz.id,
      req.user.id,
    );
    db.exec("COMMIT");
    res.json({ ok: true });
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
});
app.post("/api/quizzes/:id/duplicate", auth, (req, res) => {
  const q = get("SELECT * FROM quizzes WHERE id=?", req.params.id);
  if (!readable(req, q) || !owner(req, q))
    return res.status(403).json({ error: "Access denied." });
  const id = randomUUID();
  run(
    "INSERT INTO quizzes SELECT ?,owner,title||' (copy)',description,category,difficulty,theme,cover,visibility,'draft',settings,CURRENT_TIMESTAMP,0 FROM quizzes WHERE id=?",
    id,
    q.id,
  );
  for (const x of questions(q.id))
    run(
      "INSERT INTO questions(id,quiz_id,position,type,prompt,options,accepted,explanation,points) VALUES(?,?,?,?,?,?,?,?,?)",
      randomUUID(),
      id,
      x.position,
      x.type,
      x.prompt,
      JSON.stringify(x.options),
      JSON.stringify(x.accepted),
      x.explanation,
      x.points,
    );
  res.json({ id });
});
app.post("/api/bookmarks/:id", auth, (req, res) => {
  const q = get("SELECT * FROM quizzes WHERE id=?", req.params.id);
  if (!readable(req, q))
    return res.status(404).json({ error: "Quiz not found." });
  if (req.body.saved)
    run("INSERT OR IGNORE INTO bookmarks VALUES(?,?)", req.user.id, q.id);
  else
    run(
      "DELETE FROM bookmarks WHERE user_id=? AND quiz_id=?",
      req.user.id,
      q.id,
    );
  res.json({ ok: true });
});
app.post("/api/quizzes/:id/start", (req, res) => {
  const q = get("SELECT * FROM quizzes WHERE id=?", req.params.id);
  if (!readable(req, q))
    return res.status(404).json({ error: "Quiz not available." });
  const s = JSON.parse(q.settings);
  const preview = q.status === "draft" || !!req.body.preview;
  if (preview && !owner(req, q))
    return res.status(403).json({ error: "Only the creator can preview." });
  if (!req.user && !s.guests)
    return res.status(401).json({ error: "Please sign in to take this quiz." });
  let qs = questions(q.id);
  if (!qs.length)
    return res
      .status(400)
      .json({ error: "Add questions before previewing this quiz." });
  if (s.randomQuestions) qs = shuffle(qs);
  const id = secret(),
    started = Date.now(),
    deadline = s.time ? started + Number(s.time) * 60000 : null;
  run(
    "INSERT INTO attempts(id,quiz_id,user_id,name,started,deadline,question_order,public,preview,quiz_snapshot) VALUES(?,?,?,?,?,?,?,?,?,?)",
    id,
    q.id,
    req.user?.id || null,
    String(req.body.name || req.user?.name || "Guest").slice(0, 80),
    started,
    deadline,
    JSON.stringify(qs.map((x) => x.id)),
    req.body.public && s.rankings && !preview ? 1 : 0,
    preview ? 1 : 0,
    JSON.stringify({ ...parse(q), preview }),
  );
  res.json({
    id,
    started,
    deadline,
    quiz: { ...parse(q), preview },
    questions: qs.map(({ accepted, explanation, ...x }) => ({
      ...x,
      options: s.randomAnswers ? shuffle(x.options) : x.options,
    })),
  });
});
app.put("/api/attempts/:id/answers", (req, res) => {
  const a = get("SELECT * FROM attempts WHERE id=?", req.params.id);
  if (!a || (a.user_id && a.user_id !== req.user?.id))
    return res.status(404).json({ error: "Attempt not found." });
  if (a.submitted || (a.deadline && Date.now() > a.deadline))
    return res.status(409).json({ error: "This attempt has ended." });
  for (const x of attemptQuestions(a)) {
    if (req.body.answers?.[x.id] !== undefined)
      run(
        "INSERT INTO responses VALUES(?,?,?,NULL) ON CONFLICT(attempt_id,question_id) DO UPDATE SET answer=excluded.answer",
        a.id,
        x.id,
        String(req.body.answers[x.id]).slice(0, 10000),
      );
  }
  res.json({ ok: true });
});
app.post("/api/attempts/:id/submit", (req, res) => {
  const a = get("SELECT * FROM attempts WHERE id=?", req.params.id);
  if (!a || (a.user_id && a.user_id !== req.user?.id))
    return res.status(404).json({ error: "Attempt not found." });
  if (a.submitted) return res.json(result(a.id));
  const q = JSON.parse(a.quiz_snapshot);
  const qs = attemptQuestions(a);
  const expired = a.deadline && Date.now() > a.deadline;
  let score = 0,
    correct = 0,
    pending = 0;
  const maximum = qs.reduce((n, x) => n + x.points, 0);
  db.exec("BEGIN");
  try {
    for (const x of qs) {
      const answer = expired
        ? get(
            "SELECT answer FROM responses WHERE attempt_id=? AND question_id=?",
            a.id,
            x.id,
          )?.answer || ""
        : String(req.body.answers?.[x.id] || "").slice(0, 10000);
      const earned = grade(
        { ...x, accepted: JSON.stringify(x.accepted) },
        answer,
      );
      if (earned === null) pending++;
      else {
        score += earned;
        if (earned > 0) correct++;
      }
      run(
        "INSERT INTO responses VALUES(?,?,?,?) ON CONFLICT(attempt_id,question_id) DO UPDATE SET answer=excluded.answer,earned=excluded.earned",
        a.id,
        x.id,
        answer,
        earned,
      );
    }
    run(
      "UPDATE attempts SET submitted=?,score=?,maximum=?,correct=?,pending=? WHERE id=?",
      Math.min(Date.now(), a.deadline || Infinity),
      score,
      maximum,
      correct,
      pending,
      a.id,
    );
    db.exec("COMMIT");
    res.json(result(a.id));
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
});
function result(id) {
  const a = get("SELECT * FROM attempts WHERE id=?", id);
  const q = JSON.parse(a.quiz_snapshot);
  const s = q.settings;
  return {
    ...a,
    quiz: q,
    total: attemptQuestions(a).length,
    responses: s.showAnswers
      ? all(
          "SELECT r.*,q.prompt,q.accepted,q.explanation,q.points FROM responses r JOIN questions q ON r.question_id=q.id WHERE attempt_id=?",
          id,
        ).map((r) => ({ ...r, accepted: JSON.parse(r.accepted) }))
      : [],
  };
}
app.get("/api/quizzes/:id/leaderboard", (req, res) => {
  const q = get("SELECT * FROM quizzes WHERE id=?", req.params.id);
  if (!readable(req, q) || !JSON.parse(q.settings).rankings)
    return res.json([]);
  res.json(
    all(
      "SELECT name,score,maximum,elapsed FROM leaderboard_records WHERE quiz_id=? ORDER BY score/maximum DESC,elapsed ASC LIMIT 20",
      q.id,
    ),
  );
});
app.post("/api/reports", auth, (req, res) => {
  if (
    !String(req.body.reason || "").trim() ||
    !get("SELECT id FROM quizzes WHERE id=?", req.body.quizId)
  )
    return res.status(400).json({ error: "Choose a quiz and enter a reason." });
  run(
    "INSERT INTO reports(id,user_id,quiz_id,reason) VALUES(?,?,?,?)",
    randomUUID(),
    req.user.id,
    req.body.quizId,
    String(req.body.reason).slice(0, 2000),
  );
  res.json({ ok: true });
});
app.get("/api/admin", auth, (req, res) => {
  if (!req.user.admin)
    return res.status(403).json({ error: "Administrator access required." });
  res.json({
    users: get("SELECT COUNT(*) n FROM users").n,
    quizzes: get("SELECT COUNT(*) n FROM quizzes").n,
    attempts: get("SELECT COUNT(*) n FROM attempts WHERE submitted IS NOT NULL")
      .n,
    reports: all(
      "SELECT r.*,q.title FROM reports r JOIN quizzes q ON q.id=r.quiz_id ORDER BY r.created DESC",
    ),
    pending: all(
      "SELECT r.*,a.name,a.quiz_id,q.prompt FROM responses r JOIN attempts a ON a.id=r.attempt_id JOIN questions q ON q.id=r.question_id WHERE r.earned IS NULL AND a.submitted IS NOT NULL AND a.preview=0",
    ),
  });
});
app.patch("/api/admin/reports/:id", auth, (req, res) => {
  if (!req.user.admin) return res.sendStatus(403);
  const r = get("SELECT * FROM reports WHERE id=?", req.params.id);
  if (!r) return res.sendStatus(404);
  if (req.body.hide)
    run("UPDATE quizzes SET visibility='private' WHERE id=?", r.quiz_id);
  run("UPDATE reports SET status='resolved' WHERE id=?", r.id);
  res.json({ ok: true });
});
app.get("/api/grading", auth, (req, res) =>
  res.json(
    all(
      "SELECT r.*,a.name,q.prompt,q.points FROM responses r JOIN attempts a ON r.attempt_id=a.id JOIN questions q ON q.id=r.question_id JOIN quizzes z ON z.id=a.quiz_id WHERE z.owner=? AND r.earned IS NULL AND a.submitted IS NOT NULL AND a.preview=0",
      req.user.id,
    ),
  ),
);
app.post("/api/grading", auth, (req, res) => {
  const r = get(
    "SELECT r.*,q.points,z.owner FROM responses r JOIN questions q ON q.id=r.question_id JOIN quizzes z ON z.id=q.quiz_id WHERE r.attempt_id=? AND r.question_id=?",
    req.body.attempt,
    req.body.question,
  );
  const earned = Number(req.body.earned);
  if (
    !r ||
    r.owner !== req.user.id ||
    r.earned !== null ||
    !Number.isFinite(earned) ||
    earned < 0 ||
    earned > r.points
  )
    return res.status(400).json({ error: "Invalid grade." });
  run(
    "UPDATE responses SET earned=? WHERE attempt_id=? AND question_id=?",
    earned,
    req.body.attempt,
    req.body.question,
  );
  run(
    "UPDATE attempts SET score=score+?,pending=pending-1,correct=correct+? WHERE id=?",
    earned,
    earned === r.points ? 1 : 0,
    req.body.attempt,
  );
  res.json({ ok: true });
});
if (existsSync("dist")) {
  app.use(express.static(resolve("dist")));
  app.get("/{*path}", (req, res) => res.sendFile(resolve("dist/index.html")));
}
app.use((err, req, res, next) => {
  console.error(err.message);
  res.status(500).json({ error: "Something went wrong. Please try again." });
});
app.listen(process.env.PORT || 3001, "0.0.0.0", () =>
  console.log(`QuizCraft API: http://localhost:${process.env.PORT || 3001}`),
);
