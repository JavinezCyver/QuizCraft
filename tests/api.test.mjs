import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { createServer, request as httpRequest } from "node:http";
import { grade } from "../server/scoring.mjs";
const directory = mkdtempSync(join(tmpdir(), "quizcraft-test-"));
const database = join(directory, "test.sqlite");
let server, mailServer, deliveredMail, ownerCookie, otherCookie, quizId;
const origin = "http://localhost:3002";
async function request(path, { method = "GET", body, cookie, headers } = {}) {
  const response = await fetch(origin + "/api" + path, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(cookie ? { Cookie: cookie } : {}),
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return {
    status: response.status,
    data: await response.json(),
    cookie: response.headers.get("set-cookie")?.split(";")[0],
  };
}
test("new installations do not generate discovery quizzes", async () => {
  assert.deepEqual((await request("/quizzes")).data, []);
});
before(async () => {
  mailServer = createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      deliveredMail = JSON.parse(body);
      res.end("ok");
    });
  });
  await new Promise((resolve) => mailServer.listen(3004, "127.0.0.1", resolve));
  server = spawn(
    resolve(
      "target/debug",
      process.platform === "win32"
        ? "quizcraft-server.exe"
        : "quizcraft-server",
    ),
    [],
    {
      env: {
        ...process.env,
        PORT: "3002",
        DATABASE_PATH: database,
        ADMIN_EMAIL: "owner@example.test",
        APP_ORIGIN: origin,
        EMAIL_WEBHOOK_URL: "http://127.0.0.1:3004",
      },
      stdio: "pipe",
    },
  );
  let log = "";
  server.stderr.on("data", (x) => (log += x));
  for (let i = 0; i < 100; i++) {
    try {
      await fetch(origin + "/api/me");
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  throw new Error("Test API did not start: " + log);
});
after(async () => {
  server?.kill();
  mailServer?.close();
  await new Promise((r) => setTimeout(r, 300));
  rmSync(directory, { recursive: true, force: true });
});
const settings = {
  guests: true,
  review: true,
  showAnswers: true,
  rankings: true,
  passing: 60,
  time: 0,
  layout: "single",
  randomQuestions: false,
  randomAnswers: false,
};
function quiz(patch = {}) {
  return {
    title: "Test all question types",
    description: "Integration test",
    category: "Science",
    difficulty: "Easy",
    theme: "purple",
    cover: "",
    visibility: "public",
    status: "published",
    settings,
    questions: [
      {
        type: "multiple",
        prompt: "Two plus two?",
        options: ["3", "4"],
        accepted: ["4"],
        explanation: "Two pairs make four.",
        points: 10,
      },
      {
        type: "boolean",
        prompt: "Earth is round.",
        options: ["True", "False"],
        accepted: ["True"],
        explanation: "Earth is approximately spherical.",
        points: 10,
      },
      {
        type: "blank",
        prompt: "Capital of Japan?",
        options: [],
        accepted: ["Tokyo"],
        explanation: "Tokyo.",
        points: 20,
      },
      {
        type: "short",
        prompt: "Explain your reasoning.",
        options: [],
        accepted: [],
        explanation: "Reviewed by creator.",
        points: 10,
      },
    ],
    ...patch,
  };
}
test("normalize and grade accepted answers; preserve manual grading", () => {
  assert.equal(
    grade(
      { accepted: '["New York"]', points: 10, type: "blank" },
      "  NEW   york ",
    ),
    10,
  );
  assert.equal(
    grade({ accepted: '["True"]', points: 10, type: "boolean" }, "False"),
    0,
  );
  assert.equal(
    grade({ accepted: "[]", points: 10, type: "short" }, "Anything"),
    null,
  );
});
test("accounts, cookies, profiles and authorization", async () => {
  let r = await request("/auth/register", {
    method: "POST",
    body: {
      email: "owner@example.test",
      password: "correct-password",
      name: "Owner",
    },
  });
  assert.equal(r.status, 200);
  assert.equal(r.data.admin, false);
  const adminDb = new DatabaseSync(database);
  adminDb
    .prepare("UPDATE users SET admin=1 WHERE email=?")
    .run("owner@example.test");
  adminDb.close();
  assert.ok(r.cookie);
  ownerCookie = r.cookie;
  assert.equal(
    (await request("/me", { cookie: ownerCookie })).data.name,
    "Owner",
  );
  r = await request("/auth/register", {
    method: "POST",
    body: {
      email: "other@example.test",
      password: "other-password",
      name: "Other",
    },
  });
  otherCookie = r.cookie;
  assert.equal(
    (
      await request("/auth/login", {
        method: "POST",
        body: { email: "owner@example.test", password: "wrong" },
      })
    ).status,
    401,
  );
  assert.equal((await request("/library")).status, 401);
  assert.equal((await request("/admin", { cookie: otherCookie })).status, 403);
  assert.equal(
    (
      await request("/profile", {
        method: "PATCH",
        cookie: ownerCookie,
        body: {
          name: "Updated Owner",
          avatar: "https://example.com/avatar.png",
        },
      })
    ).data.name,
    "Updated Owner",
  );
});
test("login accepts the preserved origin on another dev port and rejects cross-origin requests", async () => {
  const body = { email: "owner@example.test", password: "correct-password" };
  // Use http.request because fetch normalizes Host to the destination URL.
  const login = (originHeader) =>
    new Promise((resolve, reject) => {
      const req = httpRequest(
        `${origin}/api/auth/login`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Origin: originHeader,
            Host: "localhost:5174",
          },
        },
        (res) => {
          let data = "";
          res.on("data", (chunk) => (data += chunk));
          res.on("end", () =>
            resolve({
              status: res.statusCode,
              data: JSON.parse(data),
              cookie: res.headers["set-cookie"],
            }),
          );
        },
      );
      req.on("error", reject);
      req.end(JSON.stringify(body));
    });
  const sameOrigin = await login("http://localhost:5174");
  assert.equal(sameOrigin.status, 200);
  assert.equal(sameOrigin.data.email, body.email);
  assert.ok(sameOrigin.cookie);
  const crossOrigin = await login("https://unrelated.example");
  assert.equal(crossOrigin.status, 403);
});
test("publish validation, owner-only editing, and protected question answers", async () => {
  quizId = (
    await request("/quizzes", { method: "POST", cookie: ownerCookie, body: {} })
  ).data.id;
  assert.equal(
    (
      await request("/quizzes/" + quizId, {
        method: "PUT",
        cookie: otherCookie,
        body: quiz(),
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await request("/quizzes/" + quizId, {
        method: "PUT",
        cookie: ownerCookie,
        body: quiz({ questions: [] }),
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await request("/quizzes/" + quizId, {
        method: "PUT",
        cookie: ownerCookie,
        body: quiz(),
      })
    ).status,
    200,
  );
  const publicQuiz = (await request("/quizzes/" + quizId)).data;
  assert.equal(publicQuiz.questions, undefined);
  const attempt = (
    await request("/quizzes/" + quizId + "/start", {
      method: "POST",
      body: { name: "Guest" },
    })
  ).data;
  assert.equal(attempt.questions[0].accepted, undefined);
  assert.equal(attempt.questions[0].explanation, undefined);
  assert.equal(attempt.questions[0].correctOption, undefined);
  assert.equal(attempt.questions[0].correct_option, undefined);
  assert.ok(attempt.questions.length === 4);
});
test("automatic scoring, duplicate submit, manual grading and historic edit safety", async () => {
  const a = (
    await request("/quizzes/" + quizId + "/start", {
      method: "POST",
      cookie: otherCookie,
      body: { name: "Learner", public: true },
    })
  ).data;
  const answers = Object.fromEntries(
    a.questions.map((q, i) => [
      q.id,
      ["4", "True", " TOKYO ", "Because science."][i],
    ]),
  );
  let r = await request("/attempts/" + a.id + "/submit", {
    method: "POST",
    cookie: otherCookie,
    body: { answers },
  });
  assert.equal(r.status, 200);
  assert.equal(r.data.score, 40);
  assert.equal(r.data.maximum, 50);
  assert.equal(r.data.pending, 1);
  assert.equal(r.data.correct, 3);
  assert.equal(
    (
      await request("/attempts/" + a.id + "/submit", {
        method: "POST",
        cookie: otherCookie,
        body: { answers: {} },
      })
    ).data.score,
    40,
  );
  assert.equal(
    (
      await request("/attempts/" + a.id + "/submit", {
        method: "POST",
        cookie: ownerCookie,
        body: {},
      })
    ).status,
    404,
  );
  const pending = (await request("/grading", { cookie: ownerCookie })).data;
  assert.equal(pending.length, 1);
  assert.equal(
    (
      await request("/grading", {
        method: "POST",
        cookie: otherCookie,
        body: { attempt: a.id, question: pending[0].question_id, earned: 10 },
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await request("/grading", {
        method: "POST",
        cookie: ownerCookie,
        body: { attempt: a.id, question: pending[0].question_id, earned: 10 },
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await request("/quizzes/" + quizId, {
        method: "PUT",
        cookie: ownerCookie,
        body: quiz({ title: "Edited quiz" }),
      })
    ).status,
    200,
  );
  r = await request("/attempts/" + a.id + "/submit", {
    method: "POST",
    cookie: otherCookie,
    body: {},
  });
  assert.equal(r.data.score, 50);
  assert.equal(r.data.responses.length, 4);
  assert.equal(r.data.quiz.title, "Test all question types");
  assert.equal(
    (await request("/quizzes/" + quizId + "/leaderboard")).data[0].score,
    50,
  );
});
test("expired timer grades only answers saved before deadline", async () => {
  const a = (
    await request("/quizzes/" + quizId + "/start", { method: "POST", body: {} })
  ).data;
  await request("/attempts/" + a.id + "/answers", {
    method: "PUT",
    body: { answers: { [a.questions[0].id]: "4" } },
  });
  const db = new DatabaseSync(database);
  db.prepare("UPDATE attempts SET deadline=? WHERE id=?").run(
    Date.now() - 1000,
    a.id,
  );
  db.close();
  assert.equal(
    (
      await request("/attempts/" + a.id + "/answers", {
        method: "PUT",
        body: { answers: { [a.questions[1].id]: "True" } },
      })
    ).status,
    409,
  );
  const r = await request("/attempts/" + a.id + "/submit", {
    method: "POST",
    body: {
      answers: Object.fromEntries(a.questions.map((q) => [q.id, "True"])),
    },
  });
  assert.equal(r.status, 200);
  assert.equal(r.data.score, 10);
  assert.equal(
    r.data.responses.find((q) => q.question_id === a.questions[1].id).answer,
    "",
  );
});
test("private and unlisted discovery, guest restrictions, previews and moderation", async () => {
  await request("/quizzes/" + quizId, {
    method: "PUT",
    cookie: ownerCookie,
    body: quiz({ visibility: "private" }),
  });
  assert.equal((await request("/quizzes/" + quizId)).status, 404);
  assert.equal(
    (
      await request("/quizzes/" + quizId + "/start", {
        method: "POST",
        cookie: otherCookie,
        body: {},
      })
    ).status,
    404,
  );
  let a = (
    await request("/quizzes/" + quizId + "/start", {
      method: "POST",
      cookie: ownerCookie,
      body: { preview: true },
    })
  ).data;
  assert.ok(a.id);
  await request("/attempts/" + a.id + "/submit", {
    method: "POST",
    cookie: ownerCookie,
    body: { answers: {} },
  });
  assert.equal(
    (await request("/library", { cookie: ownerCookie })).data.attempts.length,
    0,
  );
  await request("/quizzes/" + quizId, {
    method: "PUT",
    cookie: ownerCookie,
    body: quiz({
      visibility: "unlisted",
      settings: { ...settings, guests: false },
    }),
  });
  assert.equal((await request("/quizzes/" + quizId)).status, 200);
  assert.ok(!(await request("/quizzes")).data.some((q) => q.id === quizId));
  assert.equal(
    (
      await request("/quizzes/" + quizId + "/start", {
        method: "POST",
        body: {},
      })
    ).status,
    401,
  );
  await request("/bookmarks/" + quizId, {
    method: "POST",
    cookie: otherCookie,
    body: { saved: true },
  });
  assert.ok(
    (
      await request("/library", { cookie: otherCookie })
    ).data.bookmarks.includes(quizId),
  );
  await request("/reports", {
    method: "POST",
    cookie: otherCookie,
    body: { quizId, reason: "Review this test content." },
  });
  const admin = (await request("/admin", { cookie: ownerCookie })).data;
  assert.equal(admin.reports.length, 1);
  await request("/admin/reports/" + admin.reports[0].id, {
    method: "PATCH",
    cookie: ownerCookie,
    body: { hide: true },
  });
  assert.equal(
    (await request("/quizzes/" + quizId, { cookie: otherCookie })).status,
    404,
  );
});
test("drafts opened from Saved quizzes never enter history and legacy runs are repaired", async () => {
  const id = (
    await request("/quizzes", { method: "POST", cookie: ownerCookie, body: {} })
  ).data.id;
  await request("/quizzes/" + id, {
    method: "PUT",
    cookie: ownerCookie,
    body: quiz({ status: "draft", questions: quiz().questions.slice(0, 3) }),
  });
  await request("/bookmarks/" + id, {
    method: "POST",
    cookie: ownerCookie,
    body: { saved: true },
  });
  const saved = (await request("/library", { cookie: ownerCookie })).data.saved;
  assert.ok(saved.some((q) => q.id === id));
  const a = (
    await request("/quizzes/" + id + "/start", {
      method: "POST",
      cookie: ownerCookie,
      body: { preview: false, public: true },
    })
  ).data;
  assert.equal(a.quiz.preview, true);
  const answers = Object.fromEntries(
    a.questions.map((q, i) => [q.id, ["4", "True", "Tokyo"][i]]),
  );
  const result = (
    await request("/attempts/" + a.id + "/submit", {
      method: "POST",
      cookie: ownerCookie,
      body: { answers },
    })
  ).data;
  assert.equal(result.score, result.maximum);
  assert.ok(
    !(await request("/library", { cookie: ownerCookie })).data.attempts.some(
      (row) => row.id === a.id,
    ),
  );
  const legacy = new DatabaseSync(database);
  legacy.prepare("UPDATE attempts SET preview=0,public=1 WHERE id=?").run(a.id);
  legacy.close();
  const migration = spawnSync(
    resolve(
      "target/debug",
      process.platform === "win32"
        ? "quizcraft-server.exe"
        : "quizcraft-server",
    ),
    ["migrate"],
    { env: { ...process.env, DATABASE_PATH: database }, encoding: "utf8" },
  );
  assert.equal(migration.status, 0, migration.stderr);
  const check = new DatabaseSync(database);
  const repaired = check
    .prepare("SELECT preview,public FROM attempts WHERE id=?")
    .get(a.id);
  check.close();
  assert.equal(repaired.preview, 1);
  assert.equal(repaired.public, 0);
  await request("/quizzes/" + id, { method: "DELETE", cookie: ownerCookie });
  assert.ok(
    !(await request("/library", { cookie: ownerCookie })).data.attempts.some(
      (row) => row.id === a.id,
    ),
  );
});
test("only owners can delete quizzes; links, bookmarks and quiz history disappear", async () => {
  const selfAttempt = (
    await request("/quizzes/" + quizId + "/start", {
      method: "POST",
      cookie: ownerCookie,
      body: {},
    })
  ).data;
  await request("/attempts/" + selfAttempt.id + "/submit", {
    method: "POST",
    cookie: ownerCookie,
    body: { answers: {} },
  });
  assert.ok(
    (await request("/library", { cookie: ownerCookie })).data.attempts.some(
      (a) => a.id === selfAttempt.id,
    ),
  );
  const historyBefore = (await request("/library", { cookie: otherCookie }))
    .data.attempts;
  assert.ok(historyBefore.some((a) => a.quiz_id === quizId));
  assert.equal(
    (await request("/quizzes/" + quizId, { method: "DELETE" })).status,
    401,
  );
  assert.equal(
    (
      await request("/quizzes/" + quizId, {
        method: "DELETE",
        cookie: otherCookie,
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await request("/quizzes/" + quizId, {
        method: "DELETE",
        cookie: ownerCookie,
      })
    ).status,
    200,
  );
  for (const cookie of [undefined, ownerCookie, otherCookie])
    assert.equal((await request("/quizzes/" + quizId, { cookie })).status, 404);
  assert.equal(
    (
      await request("/quizzes/" + quizId + "/start", {
        method: "POST",
        cookie: ownerCookie,
        body: {},
      })
    ).status,
    404,
  );
  assert.equal(
    (
      await request("/quizzes/" + quizId, {
        method: "PUT",
        cookie: ownerCookie,
        body: quiz(),
      })
    ).status,
    404,
  );
  const ownerLibrary = (await request("/library", { cookie: ownerCookie }))
    .data;
  const otherLibrary = (await request("/library", { cookie: otherCookie }))
    .data;
  assert.ok(!ownerLibrary.quizzes.some((q) => q.id === quizId));
  assert.ok(!ownerLibrary.attempts.some((a) => a.quiz_id === quizId));
  assert.ok(!otherLibrary.bookmarks.includes(quizId));
  assert.deepEqual(
    otherLibrary.attempts,
    historyBefore.filter((a) => a.quiz_id !== quizId),
  );
  assert.equal(
    (
      await request("/quizzes/" + quizId, {
        method: "DELETE",
        cookie: ownerCookie,
      })
    ).status,
    404,
  );
});
test("password reset sends a single-use link and revokes sessions", async () => {
  const r = await request("/auth/register", {
    method: "POST",
    body: {
      email: "reset@example.test",
      name: "Reset tester",
      password: "before-reset-password",
    },
  });
  const cookie = r.cookie;
  assert.equal(
    (
      await request("/auth/forgot", {
        method: "POST",
        body: { email: "reset@example.test" },
      })
    ).status,
    200,
  );
  assert.equal(deliveredMail.to, "reset@example.test");
  const token = new URL(deliveredMail.url).searchParams.get("reset");
  assert.ok(token);
  assert.equal(
    (
      await request("/auth/reset", {
        method: "POST",
        body: { token, password: "after-reset-password" },
      })
    ).status,
    200,
  );
  assert.equal((await request("/me", { cookie })).data, null);
  assert.equal(
    (
      await request("/auth/reset", {
        method: "POST",
        body: { token, password: "replayed-password" },
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await request("/auth/login", {
        method: "POST",
        body: {
          email: "reset@example.test",
          password: "before-reset-password",
        },
      })
    ).status,
    401,
  );
  assert.equal(
    (
      await request("/auth/login", {
        method: "POST",
        body: { email: "reset@example.test", password: "after-reset-password" },
      })
    ).status,
    200,
  );
});
test("logout revokes session", async () => {
  await request("/auth/logout", { method: "POST", cookie: otherCookie });
  assert.equal((await request("/me", { cookie: otherCookie })).data, null);
});

test("custom medical categories save, publish and respect category privacy", async () => {
  const registered = await request("/auth/register", {
    method: "POST",
    body: {
      email: "medical@example.test",
      name: "Medical creator",
      password: "medical-password",
    },
  });
  const cookie = registered.cookie;
  const id = (await request("/quizzes", { method: "POST", cookie, body: {} }))
    .data.id;
  const draft = quiz({
    category: "  Clinical Pharmacology  ",
    status: "draft",
    visibility: "private",
  });
  assert.equal(
    (await request("/quizzes/" + id, { method: "PUT", cookie, body: draft }))
      .status,
    200,
  );
  assert.equal(
    (await request("/quizzes/" + id, { cookie })).data.category,
    "Clinical Pharmacology",
  );
  assert.ok(
    (await request("/categories", { cookie })).data.includes(
      "Clinical Pharmacology",
    ),
  );
  assert.ok(
    !(await request("/categories")).data.includes("Clinical Pharmacology"),
  );
  assert.ok(!(await request("/quizzes")).data.some((q) => q.id === id));
  for (const category of ["", " ".repeat(4), "A".repeat(61), "Bad\nCategory"]) {
    assert.equal(
      (
        await request("/quizzes/" + id, {
          method: "PUT",
          cookie,
          body: { ...draft, category },
        })
      ).status,
      400,
    );
  }
  assert.equal(
    (
      await request("/quizzes/" + id, {
        method: "PUT",
        cookie,
        body: { ...draft, status: "published", visibility: "public" },
      })
    ).status,
    200,
  );
  assert.ok(
    (await request("/quizzes")).data.some(
      (q) => q.id === id && q.category === "Clinical Pharmacology",
    ),
  );
  assert.ok(
    (await request("/categories")).data.includes("Clinical Pharmacology"),
  );
  const db = new DatabaseSync(database);
  db.prepare(
    "INSERT INTO quizzes(id,owner,title,category,status,visibility,demo) VALUES(?,?,?,?,?,?,1)",
  ).run(
    "legacy-demo",
    registered.data.id,
    "Generated example",
    "Demo-only subject",
    "published",
    "public",
  );
  db.close();
  assert.ok(
    !(await request("/quizzes")).data.some((q) => q.id === "legacy-demo"),
  );
  assert.ok(!(await request("/categories")).data.includes("Demo-only subject"));
});

test("deleting a category keeps quizzes and only affects its creator", async () => {
  const register = async (email) =>
    request("/auth/register", {
      method: "POST",
      body: { email, name: "Category owner", password: "category-password" },
    });
  const owner = await register("category-owner@example.test");
  const other = await register("category-other@example.test");
  const create = async (cookie) => {
    const id = (await request("/quizzes", { method: "POST", cookie, body: {} }))
      .data.id;
    await request("/quizzes/" + id, {
      method: "PUT",
      cookie,
      body: quiz({ category: "Anatomy" }),
    });
    return id;
  };
  const first = await create(owner.cookie),
    second = await create(owner.cookie),
    untouched = await create(other.cookie);
  assert.equal(
    (
      await request("/categories", {
        method: "DELETE",
        body: { name: "Anatomy" },
      })
    ).status,
    401,
  );
  const deleted = await request("/categories", {
    method: "DELETE",
    cookie: owner.cookie,
    body: { name: "Anatomy" },
  });
  assert.equal(deleted.status, 200);
  assert.equal(deleted.data.updated, 2);
  for (const id of [first, second]) {
    const kept = (await request("/quizzes/" + id, { cookie: owner.cookie }))
      .data;
    assert.equal(kept.category, "Uncategorized");
    assert.equal(kept.status, "published");
    assert.equal(kept.questions.length, quiz().questions.length);
  }
  assert.equal(
    (await request("/quizzes/" + untouched, { cookie: other.cookie })).data
      .category,
    "Anatomy",
  );
  assert.equal(
    (
      await request("/categories", {
        method: "DELETE",
        cookie: owner.cookie,
        body: { name: "Uncategorized" },
      })
    ).status,
    400,
  );
});

test("legacy generated demo attempts are excluded from history", async () => {
  const user = (await request("/me", { cookie: ownerCookie })).data;
  const db = new DatabaseSync(database);
  db.prepare(
    "INSERT INTO quizzes(id,title,category,status,demo) VALUES(?,?,?,'published',1)",
  ).run("demo-history-quiz", "Old generated demo", "Science");
  db.prepare(
    "INSERT INTO attempts(id,quiz_id,user_id,name,started,submitted,score,maximum,correct,preview) VALUES(?,?,?,?,1,2,10,10,1,0)",
  ).run("demo-history-attempt", "demo-history-quiz", user.id, "Legacy learner");
  db.close();
  const history = (await request("/library", { cookie: ownerCookie })).data
    .attempts;
  assert.ok(!history.some((a) => a.id === "demo-history-attempt"));
});
