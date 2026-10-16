import { createQuiz, openSettings } from "./navigation";
import { test, expect, type Page } from "@playwright/test";

const settings = {
  guests: true,
  review: true,
  showAnswers: true,
  rankings: true,
  passing: 70,
  time: 0,
  randomQuestions: false,
  randomAnswers: false,
  layout: "single",
};
const fixture = {
  title: "Offline study test",
  category: "Science",
  difficulty: "Easy",
  theme: "purple",
  status: "published",
  settings,
  questions: [
    {
      id: "one",
      type: "multiple",
      prompt: "Pick the planet",
      options: ["Mars", "Moon"],
      accepted: ["Mars"],
      explanation: "Mars is a planet.",
      points: 10,
    },
    {
      id: "two",
      type: "boolean",
      prompt: "Water is a liquid",
      options: ["True", "False"],
      accepted: ["True"],
      explanation: "At room temperature.",
      points: 10,
    },
    {
      id: "three",
      type: "blank",
      prompt: "Name our star",
      options: [],
      accepted: ["The Sun"],
      explanation: "Our nearest star.",
      points: 10,
    },
    {
      id: "four",
      type: "short",
      prompt: "Explain your study plan",
      options: [],
      accepted: [],
      explanation: "Review locally.",
      points: 10,
    },
  ],
};
async function readyOffline(page: Page) {
  await page.goto("/");
  await expect(
    page.getByRole("heading", {
      name: "Your library starts here",
      exact: true,
    }),
  ).toBeVisible({ timeout: 15000 });
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller)
      await new Promise<void>((resolve) =>
        navigator.serviceWorker.addEventListener(
          "controllerchange",
          () => resolve(),
          { once: true },
        ),
      );
  });
  await page.context().setOffline(true);
}
async function importFixture(page: Page, value = fixture) {
  await openSettings(page);
  await page
    .getByRole("button", {
      name: "Import quizzes / restore backup",
      exact: true,
    })
    .click();
  await page
    .getByLabel("Quiz or backup JSON")
    .fill(JSON.stringify({ quizzes: [value] }));
  await page
    .getByRole("button", { name: "Import quizzes", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: "My quizzes", exact: true }).click();
}
async function readData(page: Page) {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve) => {
      const request = indexedDB.open("quizcraft-offline", 1);
      request.onsuccess = () => resolve(request.result);
    });
    return new Promise<any>((resolve) => {
      const request = db.transaction("data").objectStore("data").get("library");
      request.onsuccess = () => {
        resolve(request.result);
        db.close();
      };
    });
  });
}
test("restoring a backup preserves answers, emoji ratings, question IDs and the current card", async ({
  page,
}) => {
  await readyOffline(page);
  await importFixture(page, {
    ...fixture,
    questions: fixture.questions.slice(0, 3),
  });
  await page.getByRole("button", { name: fixture.title, exact: true }).click();
  await page.getByRole("button", { name: "A. Mars", exact: true }).click();
  await page.getByRole("button", { name: "BAD", exact: true }).click();
  await page.getByRole("button", { name: "Next card", exact: true }).click();
  await page.getByRole("button", { name: "A. True", exact: true }).click();
  await page.getByRole("button", { name: "GOOD", exact: true }).click();
  await page.getByRole("button", { name: "Next card", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Your answer", exact: true })
    .fill("The Sun");
  await page.getByRole("button", { name: "BAD", exact: true }).click();
  await page
    .getByRole("button", { name: "Back to my quizzes", exact: true })
    .click();
  await openSettings(page);
  await page
    .getByRole("button", { name: "Export backup", exact: true })
    .click();
  const backup = JSON.parse(
    await page.getByLabel("Quiz or backup JSON").inputValue(),
  );
  await page
    .getByRole("button", {
      name: "Restore backup and replace local data",
      exact: true,
    })
    .click();
  const restored = await readData(page);
  expect(restored.quizzes[0].questions.map((q: any) => q.id)).toEqual(
    backup.quizzes[0].questions.map((q: any) => q.id),
  );
  expect(restored.studyProgress).toEqual(backup.studyProgress);
  await page.reload();
  await page.getByRole("button", { name: "My quizzes", exact: true }).click();
  await page.getByRole("button", { name: fixture.title, exact: true }).click();
  await expect(
    page.getByRole("textbox", { name: "Your answer", exact: true }),
  ).toHaveValue("The Sun");
  await expect(
    page.getByRole("button", { name: "BAD", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Previous", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "A. True", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    page.getByRole("button", { name: "GOOD", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Previous", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "A. Mars", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
});

test("invalid backup progress is rejected atomically and stale progress is cleared for edited decks", async ({
  page,
}) => {
  await readyOffline(page);
  await importFixture(page, {
    ...fixture,
    questions: fixture.questions.slice(0, 3),
  });
  await page.getByRole("button", { name: fixture.title, exact: true }).click();
  await page.getByRole("button", { name: "BAD", exact: true }).click();
  await page
    .getByRole("button", { name: "Back to my quizzes", exact: true })
    .click();
  await openSettings(page);
  await page
    .getByRole("button", { name: "Export backup", exact: true })
    .click();
  const backup = JSON.parse(
    await page.getByLabel("Quiz or backup JSON").inputValue(),
  );
  const before = await readData(page);
  const invalid = structuredClone(backup);
  invalid.studyProgress[invalid.quizzes[0].id].index = 999;
  await page.getByLabel("Quiz or backup JSON").fill(JSON.stringify(invalid));
  await page
    .getByRole("button", {
      name: "Restore backup and replace local data",
      exact: true,
    })
    .click();
  await expect(page.getByRole("alert")).toContainText("Invalid study progress");
  expect(await readData(page)).toEqual(before);
  backup.quizzes[0].questions.pop();
  await page.getByLabel("Quiz or backup JSON").fill(JSON.stringify(backup));
  await page
    .getByRole("button", {
      name: "Restore backup and replace local data",
      exact: true,
    })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const restored = await readData(page);
  expect(restored.quizzes[0].questions).toHaveLength(2);
  expect(restored.studyProgress).toEqual({});
});

test("invalid correct-choice imports are rejected without changing the library", async ({
  page,
}) => {
  await readyOffline(page);
  await importFixture(page);
  const before = await readData(page);
  await openSettings(page);
  await page
    .getByRole("button", {
      name: "Import quizzes / restore backup",
      exact: true,
    })
    .click();
  for (const metadata of [
    { correctOptions: {} },
    { correctOptions: [99] },
    { correctOptions: ["0"] },
    { correctOption: "0" },
    { correctOption: -1 },
  ]) {
    await page.getByLabel("Quiz or backup JSON").fill(
      JSON.stringify({
        quizzes: [
          {
            ...fixture,
            questions: [{ ...fixture.questions[0], ...metadata }],
          },
        ],
      }),
    );
    await page
      .getByRole("button", { name: "Import quizzes", exact: true })
      .click();
    await expect(page.getByRole("alert")).toContainText(
      "Invalid correct answer choices",
    );
    expect((await readData(page)).quizzes).toEqual(before.quizzes);
  }
});

test("Discover renders every deck when there are more than six", async ({
  page,
}) => {
  await readyOffline(page);
  await importFixture(page);
  await openSettings(page);
  await page
    .getByRole("button", {
      name: "Import quizzes / restore backup",
      exact: true,
    })
    .click();
  await page.getByLabel("Quiz or backup JSON").fill(
    JSON.stringify({
      quizzes: Array.from({ length: 9 }, (_, i) => ({
        ...fixture,
        title: `Additional deck ${i + 1}`,
      })),
    }),
  );
  await page
    .getByRole("button", { name: "Import quizzes", exact: true })
    .click();
  await page.getByRole("button", { name: "Discover", exact: true }).click();
  await expect(page.locator(".quiz-card")).toHaveCount(10);
  await expect(page.locator(".quiz-section-title .count-chip")).toHaveText(
    "10",
  );
  await page
    .getByRole("button", { name: "Additional deck 9", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Flashcard study mode" }),
  ).toBeVisible();
});

test("completed flashcards update statistics and history once, including after reload and backup restore", async ({
  page,
}) => {
  await readyOffline(page);
  await importFixture(page, { ...fixture, questions: [fixture.questions[2]] });
  await page.getByRole("button", { name: fixture.title, exact: true }).click();
  await page
    .getByRole("textbox", { name: "Your answer", exact: true })
    .fill("The Sun");
  await page.getByRole("button", { name: "SATISFIED", exact: true }).click();
  await page
    .getByRole("button", { name: "Finish session", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Session complete", exact: true }),
  ).toBeVisible();
  expect((await readData(page)).studySessions).toHaveLength(1);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Session complete", exact: true }),
  ).toBeVisible();
  expect((await readData(page)).studySessions).toHaveLength(1);
  await page
    .getByRole("combobox", { name: "Flashcard rating filter", exact: true })
    .click();
  await page.getByRole("option").filter({ hasText: "SATISFIED" }).click();
  await page
    .getByRole("button", { name: "Finish session", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Session complete", exact: true }),
  ).toBeVisible();
  expect((await readData(page)).studySessions).toHaveLength(1);
  await page
    .getByRole("button", { name: "Back to my quizzes", exact: true })
    .click();
  await page.getByRole("button", { name: "My dashboard", exact: true }).click();
  await expect(
    page
      .locator(".stat")
      .filter({ hasText: "Quizzes completed" })
      .locator("strong"),
  ).toHaveText("1");
  await expect(
    page
      .locator(".stat")
      .filter({ hasText: "Average score" })
      .locator("strong"),
  ).toHaveText("100%");
  await page.getByRole("button", { name: "Quiz history", exact: true }).click();
  await expect(page.locator(".history-table-row")).toHaveCount(1);
  await expect(page.locator(".history-table-row")).toContainText(
    "Flashcard session",
  );
  await page.getByRole("button", { name: /Achievements/ }).click();
  await expect(
    page.locator(".achievement").filter({ hasText: "First discovery" }),
  ).toContainText("Unlocked!");
  await openSettings(page);
  await page
    .getByRole("button", { name: "Export backup", exact: true })
    .click();
  await page
    .getByRole("button", {
      name: "Restore backup and replace local data",
      exact: true,
    })
    .click();
  expect((await readData(page)).studySessions).toHaveLength(1);
  await page.getByRole("button", { name: "My quizzes", exact: true }).click();
  await page.getByRole("button", { name: fixture.title, exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Session complete", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Start again", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Your answer", exact: true })
    .fill("Not the Sun");
  await page.getByRole("button", { name: "SATISFIED", exact: true }).click();
  await page
    .getByRole("button", { name: "Finish session", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Session complete", exact: true }),
  ).toBeVisible();
  const data = await readData(page);
  expect(data.studySessions).toHaveLength(2);
  expect(data.studySessions[1].score).toBe(0);
  expect(data.studySessions[0].id).not.toBe(data.studySessions[1].id);
});

test("starts freely, opens again offline, and preserves bookmarks and settings", async ({
  page,
}) => {
  const requests: string[] = [];
  page.on("request", (request) => {
    if (
      request.url().includes("/api/") ||
      !request.url().startsWith("http://localhost:3003")
    )
      requests.push(request.url());
  });
  await readyOffline(page);
  await importFixture(page);
  await expect(
    page.getByRole("button", {
      name: /log in|sign in|create account|log out/i,
    }),
  ).toHaveCount(0);
  await page
    .locator(".quiz-card")
    .first()
    .getByRole("button", { name: "Bookmark quiz" })
    .click();
  await openSettings(page);
  await page.getByLabel("Display name").fill("Offline Learner");
  await page
    .getByRole("button", { name: "Save settings", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.reload();
  await expect(page.locator(".sidebar-user")).toContainText("Offline Learner");
  await page
    .getByRole("button", { name: "Saved quizzes", exact: true })
    .click();
  await expect(page.locator(".quiz-card")).toHaveCount(1);
  expect(requests).toEqual([]);
});
test("creates and autosaves a draft without login or a connection", async ({
  page,
}) => {
  await readyOffline(page);
  await createQuiz(page);
  await page.getByLabel("Quiz title", { exact: true }).fill("My offline draft");
  await page
    .getByRole("button", { name: "Add first question", exact: true })
    .click();
  await expect
    .poll(
      async () =>
        (await readData(page)).quizzes.find(
          (q: any) => q.title === "My offline draft",
        )?.questions.length,
    )
    .toBe(1);
  await page.reload();
  await page.getByRole("button", { name: "My quizzes", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "My offline draft", exact: true }),
  ).toBeVisible();
  const card = page.locator(".quiz-card").filter({
    has: page.getByRole("button", { name: "My offline draft", exact: true }),
  });
  await card.getByRole("button", { name: "Edit quiz", exact: true }).click();
  await page.getByRole("button", { name: "Publish quiz", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText(
    "Complete every question",
  );
  await page
    .getByRole("combobox", { name: "Question type", exact: true })
    .click();
  await page
    .getByRole("option", { name: "True or false", exact: true })
    .click();
  await page
    .getByLabel("Your question", { exact: true })
    .fill("Study works offline");
  await page
    .getByRole("radio", { name: "Mark option 1 correct", exact: true })
    .check();
  await page.getByRole("button", { name: "Publish quiz", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "My offline draft", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Discover", exact: true }),
  ).toHaveClass(/active/);
  await expect(
    page.getByRole("combobox", { name: "Sort quizzes", exact: true }),
  ).toContainText("Newest first");
  expect(
    (await readData(page)).quizzes.find(
      (q: any) => q.title === "My offline draft",
    ).status,
  ).toBe("published");
});
test("deck titles open flashcards directly, preserve backups, and allow deletion", async ({
  page,
}) => {
  await readyOffline(page);
  await importFixture(page);
  await page.getByRole("button", { name: fixture.title, exact: true }).click();
  await expect(
    page.getByRole("dialog", { name: "Flashcard study mode" }),
  ).toBeVisible();
  await expect(page.locator(".question-take, .player-controls")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Reveal answer", exact: true })
    .click();
  await expect(
    page.locator('.flashcard-back[aria-hidden="false"]'),
  ).toContainText("Mars");
  await page.getByRole("button", { name: "Next card", exact: true }).click();
  await expect(
    page.locator('.flashcard-front[aria-hidden="false"]'),
  ).toContainText("Water is a liquid");
  await page.reload();
  await expect(
    page.getByRole("dialog", { name: "Flashcard study mode" }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await openSettings(page);
  await page
    .getByRole("button", { name: "Export backup", exact: true })
    .click();
  const backup = await page.getByLabel("Quiz or backup JSON").inputValue();
  expect(JSON.parse(backup).attempts).toHaveLength(0);
  await page
    .getByRole("button", {
      name: "Restore backup and replace local data",
      exact: true,
    })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.reload();
  await page.getByRole("button", { name: "Quiz history", exact: true }).click();
  await expect(page.locator(".history-table-row")).toHaveCount(0);
  await page.getByRole("button", { name: "My quizzes", exact: true }).click();
  const row = page.locator(".quiz-card").filter({ hasText: fixture.title });
  await expect(page.locator(".quiz-manage-row")).toHaveCount(0);
  await expect(
    row.getByRole("button", { name: "Edit quiz", exact: true }),
  ).toBeVisible();
  await expect(
    row.getByRole("button", { name: "Export quiz", exact: true }),
  ).toHaveCount(0);
  await expect(
    row.getByRole("button", { name: "Duplicate", exact: true }),
  ).toHaveCount(0);
  await row.getByRole("button", { name: "Delete", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Delete quiz", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: fixture.title, exact: true }),
  ).toHaveCount(0);
  expect((await readData(page)).attempts).toHaveLength(0);
});
test("flashcards and quiz file imports work offline; invalid imports preserve data", async ({
  page,
}) => {
  await readyOffline(page);
  await importFixture(page);
  await page.getByRole("button", { name: "My quizzes", exact: true }).click();
  const card = page.locator(".quiz-card").filter({
    has: page.getByRole("button", { name: fixture.title, exact: true }),
  });
  await card.getByRole("button", { name: fixture.title, exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("Pick the planet");
  await page
    .getByRole("button", { name: "Reveal answer", exact: true })
    .click();
  await expect(page.locator(".flashcard-back")).toContainText("Mars");
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("dialog")).toContainText("Water is a liquid");
  await page.keyboard.press("Escape");
  await openSettings(page);
  await page
    .getByRole("button", {
      name: "Import quizzes / restore backup",
      exact: true,
    })
    .click();
  await page
    .getByLabel("Quiz or backup JSON")
    .fill('{"quizzes":[{"title":"bad"}]}');
  await page
    .getByRole("button", { name: "Import quizzes", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText("Invalid quiz");
  expect((await readData(page)).quizzes).toHaveLength(1);
});

test("flashcard study timer ends the session and can restart without submitting", async ({
  page,
}) => {
  await page.clock.install();
  await readyOffline(page);
  await importFixture(page, {
    ...fixture,
    settings: { ...settings, time: 1 },
    questions: [fixture.questions[1]],
  });
  await page.getByRole("button", { name: fixture.title, exact: true }).click();
  await expect(
    page.getByRole("timer", { name: "Study time remaining" }),
  ).toContainText("1:00");
  await page.clock.fastForward(61000);
  await expect(
    page.getByRole("heading", { name: "Study time is up" }),
  ).toBeVisible();
  expect((await readData(page)).attempts).toHaveLength(0);
  await page.getByRole("button", { name: "Start again", exact: true }).click();
  await expect(page.getByRole("timer")).toContainText("1:00");
  await expect(page.locator(".flashcard")).toBeVisible();
});

test("saved flashcard settings control answer reveal and shuffle cards and choices", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Math.random = () => 0;
  });
  await readyOffline(page);
  await importFixture(page, {
    ...fixture,
    questions: fixture.questions.slice(0, 3),
  });
  await page.getByRole("button", { name: "Edit quiz", exact: true }).click();
  await page.getByRole("button", { name: /Flashcard settings/ }).click();
  await expect(
    page.getByRole("combobox", { name: "Question layout" }),
  ).toHaveCount(0);
  await expect(page.getByLabel("Passing score (%)")).toHaveCount(0);
  await page.getByRole("switch", { name: /Reveal answers/ }).uncheck();
  await page.getByRole("switch", { name: /Shuffle cards/ }).check();
  await page.getByRole("switch", { name: /Shuffle answer choices/ }).check();
  await page.getByRole("button", { name: "Preview", exact: true }).click();
  const front = page.locator('.flashcard-front[aria-hidden="false"]');
  await expect(front).toContainText("Water is a liquid");
  await expect(
    page.getByRole("button", { name: "Answer reveal is off" }),
  ).toBeDisabled();
  await page.locator(".flashcard").press("Enter");
  await expect(front).toBeVisible();
  await page.getByRole("button", { name: "Next card", exact: true }).click();
  await expect(front).toContainText("Name our star");
  await page.getByRole("button", { name: "Next card", exact: true }).click();
  await expect(front).toContainText("Pick the planet");
  await expect(front.locator(".flashcard-option")).toHaveText([
    "A. Moon",
    "B. Mars",
  ]);
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Edit quiz", exact: true }).click();
  await page.getByRole("button", { name: /Flashcard settings/ }).click();
  await page.getByRole("switch", { name: /Reveal answers/ }).check();
  await page.getByRole("button", { name: "Preview", exact: true }).click();
  await page
    .getByRole("button", { name: "Reveal answer", exact: true })
    .click();
  await expect(
    page.locator('.flashcard-back[aria-hidden="false"]'),
  ).toContainText("True");
});

test("native frontend starts and saves without invoking an HTTP bridge", async ({
  page,
}) => {
  await page.addInitScript(() => {
    (window as any).isTauri = true;
    (window as any).__TAURI_INTERNALS__ = {
      invoke: () => {
        throw new Error("The offline app must not call a server bridge.");
      },
    };
  });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(
    page.getByRole("heading", {
      name: "Your library starts here",
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.locator(".quiz-card")).toHaveCount(0);
  await page.context().setOffline(true);
  await createQuiz(page);
  await page
    .getByLabel("Quiz title", { exact: true })
    .fill("Native offline draft");
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Native offline draft", exact: true }),
  ).toBeVisible();
  expect(errors).toEqual([]);
  expect(
    await page.evaluate(() => navigator.serviceWorker.controller),
  ).toBeNull();
});

test("Android page stays at a fixed scale during pinch gestures and still accepts taps", async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    userAgent:
      "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36",
  });
  try {
    const page = await context.newPage();
    await page.addInitScript(() => {
      (window as any).isTauri = true;
    });
    await page.goto("http://localhost:3003/");
    await expect(
      page.getByRole("heading", {
        name: "Your library starts here",
        exact: true,
      }),
    ).toBeVisible();
    await expect(page.locator("html")).toHaveClass(/android-app/);
    await expect(page.locator('meta[name="viewport"]')).toHaveAttribute(
      "content",
      /maximum-scale=1,user-scalable=no/,
    );
    const session = await context.newCDPSession(page);
    await session.send("Input.synthesizePinchGesture", {
      x: 195,
      y: 350,
      scaleFactor: 2,
      gestureSourceType: "touch",
    });
    await expect
      .poll(() => page.evaluate(() => window.visualViewport!.scale))
      .toBe(1);
    await createQuiz(page);
    await page
      .getByLabel("Quiz title", { exact: true })
      .fill("Fixed scale draft");
    await page.getByRole("button", { name: "Save draft", exact: true }).tap();
    await expect(
      page.getByRole("button", { name: "Fixed scale draft", exact: true }),
    ).toBeVisible();
    await expect
      .poll(() => page.evaluate(() => window.visualViewport!.scale))
      .toBe(1);
  } finally {
    await context.close();
  }
});

test("editor arrows switch between true/false and multiple-choice questions without reordering", async ({
  page,
}) => {
  await readyOffline(page);
  await importFixture(page, {
    ...fixture,
    questions: [
      fixture.questions[1],
      fixture.questions[0],
      fixture.questions[2],
    ],
  });
  await page
    .locator(".quiz-card")
    .filter({ hasText: fixture.title })
    .getByRole("button", { name: "Edit quiz", exact: true })
    .click();
  await expect(
    page.getByRole("combobox", { name: "Question type", exact: true }),
  ).toContainText("True or false");
  await expect(
    page.getByRole("button", { name: "Previous question", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("textbox", { name: "Your question", exact: true })
    .fill("First question: true or false");
  await page
    .getByRole("button", { name: "Next question", exact: true })
    .click();
  await expect(page.locator(".question-editor h2")).toHaveText("Question 2");
  await expect(
    page.getByRole("combobox", { name: "Question type", exact: true }),
  ).toContainText("Multiple choice");
  await expect(
    page.getByRole("textbox", { name: "Your question", exact: true }),
  ).toHaveText("Pick the planet");
  await expect(
    page.getByRole("textbox", { name: "Option 1", exact: true }),
  ).toHaveValue("Mars");
  await expect(
    page.getByRole("textbox", { name: "Option 2", exact: true }),
  ).toHaveValue("Moon");
  await page
    .getByRole("textbox", { name: "Your question", exact: true })
    .fill("Second question: multiple choice");
  await page
    .getByRole("button", { name: "Next question", exact: true })
    .click();
  await expect(
    page.getByRole("combobox", { name: "Question type", exact: true }),
  ).toContainText("Fill in the blank");
  await expect(
    page.getByRole("button", { name: "Next question", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: "Previous question", exact: true })
    .click();
  await expect(
    page.getByRole("textbox", { name: "Your question", exact: true }),
  ).toHaveText("Second question: multiple choice");
  await page
    .getByRole("button", { name: "Previous question", exact: true })
    .click();
  await expect(
    page.getByRole("combobox", { name: "Question type", exact: true }),
  ).toContainText("True or false");
  await expect(
    page.getByRole("textbox", { name: "Your question", exact: true }),
  ).toHaveText("First question: true or false");
  await expect(
    page.getByRole("textbox", { name: "Option 1", exact: true }),
  ).toHaveValue("True");
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  const saved = (await readData(page)).quizzes[0];
  expect(saved.questions.map((q: any) => q.type)).toEqual([
    "boolean",
    "multiple",
    "blank",
  ]);
  expect(saved.questions.map((q: any) => q.accepted)).toEqual([
    ["True"],
    ["Mars"],
    ["The Sun"],
  ]);
  expect(saved.questions.map((q: any) => q.prompt)).toEqual([
    "First question: true or false",
    "Second question: multiple choice",
    "Name our star",
  ]);
});

test("the editor plus adds a clean question without copying the current content", async ({
  page,
}) => {
  await readyOffline(page);
  await importFixture(page, { ...fixture, questions: [fixture.questions[1]] });
  await page
    .locator(".quiz-card")
    .filter({ hasText: fixture.title })
    .getByRole("button", { name: "Edit quiz", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Add blank question", exact: true })
    .click();
  await expect(page.locator(".question-editor h2")).toHaveText("Question 2");
  await expect(
    page.getByRole("textbox", { name: "Your question", exact: true }),
  ).toHaveText("");
  await expect(
    page.getByRole("textbox", {
      name: "Answer explanation (optional)",
      exact: true,
    }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("combobox", { name: "Question type", exact: true }),
  ).toContainText("Fill in the blank");
  await expect(
    page.getByRole("textbox", {
      name: /^Accepted answers \(one per line\)/,
    }),
  ).toHaveValue("");
  await expect(
    page.getByRole("checkbox", { name: "Mark option 1 correct", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  const questions = (await readData(page)).quizzes[0].questions;
  expect(questions).toHaveLength(2);
  expect(questions[0].prompt).toBe("Water is a liquid");
  expect(questions[0].accepted).toEqual(["True"]);
  expect(questions[1].id).not.toBe(questions[0].id);
  expect(questions[1].accepted).toEqual([]);
  expect(questions[1].options).toEqual([]);
  expect(questions[1].explanation).toBe("");
});

test("new installations are empty and another device never receives local quizzes", async ({
  page,
  browser,
}) => {
  await readyOffline(page);
  const initial = await readData(page);
  expect(initial.quizzes).toEqual([]);
  expect(initial.bookmarks).toEqual([]);
  expect(initial.attempts).toEqual([]);
  await importFixture(page);
  const otherDevice = await browser.newContext();
  try {
    const otherPage = await otherDevice.newPage();
    await otherPage.goto("http://localhost:3003/");
    await expect(
      otherPage.getByRole("heading", {
        name: "Your library starts here",
        exact: true,
      }),
    ).toBeVisible();
    await expect(otherPage.locator(".quiz-card")).toHaveCount(0);
    expect((await readData(otherPage)).quizzes).toEqual([]);
    await otherPage.reload();
    await expect(
      otherPage.getByRole("heading", {
        name: "Your library starts here",
        exact: true,
      }),
    ).toBeVisible();
  } finally {
    await otherDevice.close();
  }
  await page.reload();
  await page.getByRole("button", { name: "My quizzes", exact: true }).click();
  await expect(
    page.getByRole("button", { name: fixture.title, exact: true }),
  ).toBeVisible();
});

test("question and answer pictures survive offline backup restore and respect answer reveal settings", async ({
  page,
}) => {
  await readyOffline(page);
  const picture = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 80;
    canvas.height = 60;
    const context = canvas.getContext("2d")!;
    context.fillStyle = "#7c3aed";
    context.fillRect(0, 0, 80, 60);
    return canvas.toDataURL("image/png");
  });
  await importFixture(page, {
    ...fixture,
    questions: [
      { ...fixture.questions[2], questionImage: picture, answerImage: picture },
    ],
  });
  await page.getByRole("button", { name: fixture.title, exact: true }).click();
  await expect(
    page.getByRole("img", { name: "Question picture", exact: true }),
  ).toHaveAttribute("src", picture);
  await page
    .getByRole("button", { name: "Reveal answer", exact: true })
    .click();
  await expect(
    page.getByRole("img", { name: "Answer picture", exact: true }),
  ).toHaveAttribute("src", picture);
  await page.keyboard.press("Escape");
  await openSettings(page);
  await page
    .getByRole("button", { name: "Export backup", exact: true })
    .click();
  const backup = JSON.parse(
    await page.getByLabel("Quiz or backup JSON").inputValue(),
  );
  expect(backup.quizzes[0].questions[0]).toMatchObject({
    questionImage: picture,
    answerImage: picture,
  });
  await page
    .getByRole("button", {
      name: "Restore backup and replace local data",
      exact: true,
    })
    .click();
  await page.reload();
  await page.getByRole("button", { name: "My quizzes", exact: true }).click();
  await page.getByRole("button", { name: fixture.title, exact: true }).click();
  await expect(
    page.getByRole("img", { name: "Question picture", exact: true }),
  ).toHaveAttribute("src", picture);
  await page
    .getByRole("button", { name: "Reveal answer", exact: true })
    .click();
  await expect(
    page.getByRole("img", { name: "Answer picture", exact: true }),
  ).toHaveAttribute("src", picture);
  await page
    .getByRole("button", { name: "Back to my quizzes", exact: true })
    .click();
  await page.getByRole("button", { name: "Edit quiz", exact: true }).click();
  await page.getByRole("button", { name: /Flashcard settings/ }).click();
  await page.getByRole("switch", { name: /Reveal answers/ }).uncheck();
  await page.getByRole("button", { name: "Preview", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Answer reveal is off", exact: true }),
  ).toBeDisabled();
  await expect(page.locator(".flashcard-back img")).toHaveCount(0);
  await expect(
    page.getByRole("img", { name: "Question picture", exact: true }),
  ).toBeVisible();
});

test("large cover photos are resized, displayed, and retained offline after reload", async ({
  page,
}) => {
  await readyOffline(page);
  await createQuiz(page);
  await page.getByLabel("Quiz title", { exact: true }).fill("Photo cover test");
  const image = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 2400;
    canvas.height = 1200;
    const context = canvas.getContext("2d")!;
    context.fillStyle = "#ee6622";
    context.fillRect(0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/png").split(",")[1];
  });
  await page.getByLabel("Cover image", { exact: true }).setInputFiles({
    name: "large-phone-photo.png",
    mimeType: "application/octet-stream",
    buffer: Buffer.concat([
      Buffer.from(image, "base64"),
      Buffer.alloc(3_100_000),
    ]),
  });
  const preview = page.getByRole("img", { name: "Quiz cover preview" });
  await expect(preview).toBeVisible();
  await expect
    .poll(() => preview.evaluate((img: HTMLImageElement) => img.naturalWidth))
    .toBe(1600);
  expect(
    await preview.evaluate((img: HTMLImageElement) => img.naturalHeight),
  ).toBe(800);
  await expect
    .poll(
      async () =>
        (await readData(page)).quizzes.find(
          (q: any) => q.title === "Photo cover test",
        )?.cover,
    )
    .toMatch(/^data:image\/jpeg;base64,/);
  await page.reload();
  await page.getByRole("button", { name: "My quizzes", exact: true }).click();
  const card = page.locator(".quiz-card").filter({
    has: page.getByRole("button", { name: "Photo cover test", exact: true }),
  });
  await expect(card).toBeVisible();
  const coverImage = card.locator(".quiz-cover-image");
  await expect(coverImage).toHaveAttribute("src", /^data:image\/jpeg;base64,/);
  await expect
    .poll(() =>
      coverImage.evaluate((image: HTMLImageElement) => image.naturalWidth),
    )
    .toBe(1600);
  for (const [width, height] of [
    [320, 568],
    [390, 844],
    [768, 1024],
    [1024, 768],
    [1440, 900],
    [844, 390],
  ]) {
    await page.setViewportSize({ width, height });
    const dimensions = await coverImage.evaluate((image: HTMLImageElement) => {
      const cover = image.parentElement!.getBoundingClientRect();
      const picture = image.getBoundingClientRect();
      return {
        top: picture.top - cover.top,
        bottom: cover.bottom - picture.bottom,
        width: cover.width - picture.width,
        ratio: picture.width / picture.height,
        nativeRatio: image.naturalWidth / image.naturalHeight,
      };
    });
    expect(Math.abs(dimensions.top)).toBeLessThanOrEqual(1);
    expect(Math.abs(dimensions.bottom)).toBeLessThanOrEqual(1);
    expect(Math.abs(dimensions.width)).toBeLessThanOrEqual(1);
    expect(Math.abs(dimensions.ratio - dimensions.nativeRatio)).toBeLessThan(
      0.02,
    );
  }
  await page.setViewportSize({ width: 1280, height: 900 });
  await card.getByRole("button", { name: "Edit quiz", exact: true }).click();
  await expect(preview).toBeVisible();
  await expect
    .poll(() => preview.evaluate((img: HTMLImageElement) => img.naturalWidth))
    .toBe(1600);
  await page
    .getByRole("button", { name: "Remove cover image", exact: true })
    .click();
  await expect(preview).toHaveCount(0);
  await expect
    .poll(
      async () =>
        (await readData(page)).quizzes.find(
          (q: any) => q.title === "Photo cover test",
        )?.cover,
    )
    .toBe("");
});

test("Android back closes overlays, leaves the editor, and keeps Discover open", async ({
  page,
}) => {
  await readyOffline(page);
  const back = () =>
    page.evaluate(() => window.dispatchEvent(new Event("quizcraft-back")));
  await openSettings(page);
  await expect(page.getByRole("dialog")).toBeVisible();
  await back();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await createQuiz(page);
  await page
    .getByLabel("Quiz title", { exact: true })
    .fill("Back saves my draft");
  await back();
  await expect(page.getByLabel("Quiz title", { exact: true })).toHaveCount(0);
  await expect
    .poll(async () =>
      (await readData(page)).quizzes.some(
        (q: any) => q.title === "Back saves my draft",
      ),
    )
    .toBe(true);
  await back();
  await expect(
    page.getByRole("textbox", { name: "Search quizzes", exact: true }),
  ).toBeVisible();
  await back();
  await expect(
    page.getByRole("textbox", { name: "Search quizzes", exact: true }),
  ).toBeVisible();
});

test("flashcards return to Discover or My quizzes according to their starting page", async ({
  page,
}) => {
  await readyOffline(page);
  await importFixture(page);
  const openCards = async () => {
    await page
      .locator(".quiz-card")
      .filter({
        has: page.getByRole("button", { name: fixture.title, exact: true }),
      })
      .first()
      .getByRole("button", { name: fixture.title, exact: true })
      .click();
    await expect(
      page.getByRole("dialog", { name: "Flashcard study mode" }),
    ).toBeVisible();
  };
  await page.getByRole("button", { name: "Discover", exact: true }).click();
  await openCards();
  await page
    .getByRole("button", { name: "Back to discover", exact: true })
    .click();
  await expect(
    page.getByRole("textbox", { name: "Search quizzes", exact: true }),
  ).toBeVisible();
  await openCards();
  await page.evaluate(() => window.dispatchEvent(new Event("quizcraft-back")));
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.getByRole("textbox", { name: "Search quizzes", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "My quizzes", exact: true }).click();
  await openCards();
  await page
    .getByRole("button", { name: "Back to my quizzes", exact: true })
    .click();
  await expect(page.locator(".sidebar nav button.active")).toHaveText(
    "My quizzes",
  );
});

test("ratings repeat only after the pass and finishing requires SATISFIED", async ({
  page,
}) => {
  await readyOffline(page);
  await importFixture(page, {
    ...fixture,
    questions: fixture.questions.slice(0, 3),
  });
  await page.getByRole("button", { name: fixture.title, exact: true }).click();
  await expect(page.locator(".flashcard .flashcard-rating")).toHaveCount(3);
  await expect(page.locator(".flashcard-ratings")).not.toContainText(
    /BAD|GOOD|SATISFIED/,
  );
  const front = page.locator('.flashcard-front[aria-hidden="false"]');
  const next = page.getByRole("button", { name: "Next card", exact: true });
  await front.getByRole("button", { name: "A. Mars", exact: true }).click();
  await page.getByRole("button", { name: "BAD", exact: true }).click();
  await expect(
    page.getByRole("img", { name: "Card 1: bad", exact: true }),
  ).toHaveCSS("background-color", "rgb(239, 68, 68)");
  await next.click();
  await expect(front).toContainText("Water is a liquid");
  await front.getByRole("button", { name: "A. True", exact: true }).click();
  await page.getByRole("button", { name: "SATISFIED", exact: true }).click();
  await next.click();
  await expect(front).toContainText("Name our star");
  await front.getByRole("textbox", { name: "Your answer" }).fill("Sun");
  await page.getByRole("button", { name: "SATISFIED", exact: true }).click();
  await page
    .getByRole("button", { name: "Review remaining", exact: true })
    .click();
  await expect(front).toContainText("Pick the planet");
  await expect(
    page.locator('.flashcard-back[aria-hidden="false"]'),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "GOOD", exact: true }).click();
  await expect(
    page.getByRole("img", { name: "Card 1: good", exact: true }),
  ).toHaveCSS("background-color", "rgb(34, 197, 94)");
  await expect(
    page.getByRole("button", { name: "Finish session", exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Review remaining", exact: true })
    .click();
  await expect(front).toContainText("Pick the planet");
  await page.getByRole("button", { name: "SATISFIED", exact: true }).click();
  await expect(
    page.getByRole("img", { name: "Card 1: satisfied", exact: true }),
  ).toHaveCSS("background-color", "rgb(167, 139, 250)");
  await page
    .getByRole("button", { name: "Finish session", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Session complete" }),
  ).toBeVisible();
  expect((await readData(page)).attempts).toHaveLength(0);
  await page.getByRole("button", { name: "Start again", exact: true }).click();
  await expect(
    page.getByRole("img", { name: "Card 1: not rated", exact: true }),
  ).toBeVisible();
  await next.click();
  await expect(front).toContainText("Water is a liquid");
});

test("skipped answers return for completion and entered answers survive navigation", async ({
  page,
}) => {
  await readyOffline(page);
  await importFixture(page, {
    ...fixture,
    questions: fixture.questions.slice(0, 3),
  });
  await page.getByRole("button", { name: fixture.title, exact: true }).click();
  const front = page.locator('.flashcard-front[aria-hidden="false"]');
  const next = page.getByRole("button", { name: "Next card", exact: true });
  const review = page.getByRole("button", {
    name: "Review unanswered",
    exact: true,
  });
  const finish = page.getByRole("button", {
    name: "Finish session",
    exact: true,
  });
  // Revealing or rating a question does not count as answering it.
  await page.getByRole("button", { name: "SATISFIED", exact: true }).click();
  await front
    .getByRole("button", { name: "Reveal answer", exact: true })
    .click();
  await next.click();
  await expect(front).toContainText("Water is a liquid");
  await next.click();
  const input = front.getByRole("textbox", { name: "Your answer" });
  await expect(input).toHaveAttribute("required", "");
  await input.fill("   ");
  await expect(finish).toHaveCount(0);
  await review.click();
  await expect(front).toContainText("Pick the planet");
  await expect(front.getByRole("alert")).toContainText(
    "3 questions still unanswered",
  );
  await front.getByRole("button", { name: "A. Mars", exact: true }).click();
  await next.click();
  await front.getByRole("button", { name: "A. True", exact: true }).click();
  await page.getByRole("button", { name: "Previous", exact: true }).click();
  await expect(
    front.getByRole("button", { name: "A. Mars", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await next.click();
  await expect(
    front.getByRole("button", { name: "A. True", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "SATISFIED", exact: true }).click();
  await next.click();
  await expect(input).toHaveValue("   ");
  await expect(input).toHaveAttribute("aria-invalid", "true");
  await review.click();
  await expect(front).toContainText("Name our star");
  await expect(front.getByRole("alert")).toContainText(
    "1 question still unanswered",
  );
  await input.fill("Sun");
  await expect(input).toHaveAttribute("aria-invalid", "false");
  await expect(finish).toHaveCount(0);
  await page.getByRole("button", { name: "SATISFIED", exact: true }).click();
  await finish.click();
  await expect(
    page.getByRole("heading", { name: "Session complete", exact: true }),
  ).toBeVisible();
});

test("rating filters preserve answers and cannot finish with unanswered cards elsewhere", async ({
  page,
}) => {
  await readyOffline(page);
  await importFixture(page, {
    ...fixture,
    questions: fixture.questions.slice(0, 3),
  });
  await page.getByRole("button", { name: fixture.title, exact: true }).click();
  const front = page.locator('.flashcard-front[aria-hidden="false"]');
  await front.getByRole("button", { name: "A. Mars", exact: true }).click();
  await page.getByRole("button", { name: "SATISFIED", exact: true }).click();
  await page.getByRole("combobox", { name: "Flashcard rating filter" }).click();
  await page.getByRole("option").filter({ hasText: "SATISFIED" }).click();
  await expect(
    front.getByRole("button", { name: "A. Mars", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    page.getByRole("button", { name: "Finish session", exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Review unanswered", exact: true })
    .click();
  await expect(
    page.getByRole("combobox", { name: "Flashcard rating filter" }),
  ).toContainText("All cards");
  await expect(front).toContainText("Water is a liquid");
  await front.getByRole("button", { name: "A. True", exact: true }).click();
  await page.getByRole("button", { name: "SATISFIED", exact: true }).click();
  await page.getByRole("button", { name: "Next card", exact: true }).click();
  await front.getByRole("textbox", { name: "Your answer" }).fill("Sun");
  await page.getByRole("button", { name: "SATISFIED", exact: true }).click();
  await page
    .getByRole("button", { name: "Finish session", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Session complete", exact: true }),
  ).toBeVisible();
});

test("study answers, ratings, review passes and completion survive home and reload", async ({
  page,
}) => {
  await readyOffline(page);
  await importFixture(page, {
    ...fixture,
    questions: fixture.questions.slice(0, 3),
  });
  const open = () =>
    page.getByRole("button", { name: fixture.title, exact: true }).click();
  const front = page.locator('.flashcard-front[aria-hidden="false"]');
  const next = page.getByRole("button", { name: "Next card", exact: true });
  await open();
  await front.getByRole("button", { name: "A. Mars", exact: true }).click();
  await page.getByRole("button", { name: "BAD", exact: true }).click();
  await next.click();
  await front.getByRole("button", { name: "A. True", exact: true }).click();
  await page.getByRole("button", { name: "GOOD", exact: true }).click();
  await next.click();
  await expect(front).toContainText("Name our star");
  await front.getByRole("textbox", { name: "Your answer" }).fill("Sun");
  await page.getByRole("button", { name: "SATISFIED", exact: true }).click();
  await page
    .getByRole("button", { name: "Back to my quizzes", exact: true })
    .click();
  await page.getByRole("button", { name: "Discover", exact: true }).click();
  await open();
  await expect(front).toContainText("Name our star");
  await expect(front.getByRole("textbox", { name: "Your answer" })).toHaveValue(
    "Sun",
  );
  await expect(
    page.getByRole("button", { name: "SATISFIED", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.reload();
  await expect(front).toContainText("Name our star");
  await expect(front.getByRole("textbox", { name: "Your answer" })).toHaveValue(
    "Sun",
  );
  await page
    .getByRole("button", { name: "Review remaining", exact: true })
    .click();
  await expect(front).toContainText("Pick the planet");
  await expect(
    front.getByRole("button", { name: "A. Mars", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    page.getByRole("button", { name: "BAD", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  // Both BAD and GOOD get one turn per completed pass.
  await page.reload();
  await expect(front).toContainText("Pick the planet");
  await page.getByRole("button", { name: "SATISFIED", exact: true }).click();
  await next.click();
  await expect(front).toContainText("Water is a liquid");
  await expect(
    front.getByRole("button", { name: "A. True", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    page.getByRole("button", { name: "GOOD", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "SATISFIED", exact: true }).click();
  await page
    .getByRole("button", { name: "Finish session", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Session complete", exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Session complete", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Start again", exact: true }).click();
  await expect(front).toContainText("Pick the planet");
  await expect(
    front.getByRole("button", { name: "A. Mars", exact: true }),
  ).toHaveAttribute("aria-pressed", "false");
  await page.reload();
  await expect(
    page.getByRole("button", { name: "BAD", exact: true }),
  ).toHaveAttribute("aria-pressed", "false");
  expect((await readData(page)).quizzes).toHaveLength(1);
});

test("resuming shuffled cards preserves question and answer order and the rating filter", async ({
  page,
}) => {
  await readyOffline(page);
  await importFixture(page, {
    ...fixture,
    settings: { ...settings, randomQuestions: true, randomAnswers: true },
    questions: Array.from({ length: 6 }, (_, i) => ({
      ...fixture.questions[0],
      id: String(i),
      prompt: `Shuffled card ${i}`,
      options: ["One", "Two", "Three", "Four"],
    })),
  });
  await page.getByRole("button", { name: fixture.title, exact: true }).click();
  const front = page.locator('.flashcard-front[aria-hidden="false"]');
  const prompt = await front.locator(".flashcard-text").innerText();
  const options = await front.locator(".flashcard-option").allTextContents();
  await front.locator(".flashcard-option").nth(1).click();
  await page.getByRole("button", { name: "GOOD", exact: true }).click();
  await page.getByRole("combobox", { name: "Flashcard rating filter" }).click();
  await page.getByRole("option").filter({ hasText: "GOOD" }).click();
  await page.reload();
  await expect(
    page.getByRole("combobox", { name: "Flashcard rating filter" }),
  ).toContainText("GOOD");
  await expect(front.locator(".flashcard-text")).toHaveText(prompt);
  await expect(front.locator(".flashcard-option")).toHaveText(options);
  await expect(front.locator(".flashcard-option").nth(1)).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(
    page.getByRole("button", { name: "Finish session", exact: true }),
  ).toHaveCount(0);
});

test("touch swipes over choices and card text navigate without revealing answers", async ({
  page,
}) => {
  await readyOffline(page);
  await importFixture(page, {
    ...fixture,
    questions: fixture.questions.slice(0, 3),
  });
  await page.getByRole("button", { name: fixture.title, exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  const session = await page.context().newCDPSession(page);
  await session.send("Emulation.setTouchEmulationEnabled", {
    enabled: true,
    maxTouchPoints: 1,
  });
  const swipe = async (selector: string, direction: number) => {
    const target = page.locator(selector);
    await target.scrollIntoViewIfNeeded();
    const box = (await target.boundingBox())!;
    const y = box.y + box.height / 2;
    const startX = box.x + box.width * (direction > 0 ? 0.8 : 0.2);
    const endX = box.x + box.width * (direction > 0 ? 0.2 : 0.8);
    await session.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ x: startX, y }],
    });
    for (let step = 1; step <= 8; step++)
      await session.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [{ x: startX + ((endX - startX) * step) / 8, y }],
      });
    await session.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
  };
  const front = page.locator('.flashcard-front[aria-hidden="false"]');
  await swipe(
    '.flashcard-front[aria-hidden="false"] .flashcard-option:first-of-type',
    1,
  );
  await expect(front).toContainText("Water is a liquid");
  await swipe('.flashcard-front[aria-hidden="false"] .flashcard-text', -1);
  await expect(front).toContainText("Pick the planet");
  await expect(
    page.locator('.flashcard-back[aria-hidden="false"]'),
  ).toHaveCount(0);
  await front.getByRole("button", { name: "A. Mars", exact: true }).click();
  await expect(
    front.getByRole("button", { name: "A. Mars", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await front
    .getByRole("button", { name: "Reveal answer", exact: true })
    .click();
  await expect(
    page.locator('.flashcard-back[aria-hidden="false"]'),
  ).toContainText("Mars");
  await swipe('.flashcard-back[aria-hidden="false"]', 1);
  await expect(front).toContainText("Water is a liquid");
});

test("all shared dropdowns allow page scrolling and long menus scroll independently", async ({
  page,
}) => {
  await readyOffline(page);
  await openSettings(page);
  await page
    .getByRole("button", {
      name: "Import quizzes / restore backup",
      exact: true,
    })
    .click();
  await page.getByLabel("Quiz or backup JSON").fill(
    JSON.stringify({
      quizzes: Array.from({ length: 24 }, (_, i) => ({
        ...fixture,
        title: `Study deck ${i}`,
        category: `Subject ${String(i).padStart(2, "0")}`,
        questions: [fixture.questions[0]],
      })),
    }),
  );
  await page
    .getByRole("button", { name: "Import quizzes", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: "My quizzes", exact: true }).click();
  const category = page.getByRole("combobox", {
    name: "Flashcard category",
    exact: true,
  });
  await category.click();
  await expect(page.getByRole("listbox")).toBeInViewport({ ratio: 1 });
  const triggerBounds = (await category.boundingBox())!;
  const menuBounds = (await page.getByRole("listbox").boundingBox())!;
  expect(Math.abs(menuBounds.x - triggerBounds.x)).toBeLessThan(1);
  expect(Math.abs(menuBounds.width - triggerBounds.width)).toBeLessThan(1);
  const before = await page.evaluate(() => window.scrollY);
  await page.mouse.move(
    page.viewportSize()!.width - 20,
    page.viewportSize()!.height - 20,
  );
  await page.mouse.wheel(0, 100);
  await expect
    .poll(() => page.evaluate(() => window.scrollY))
    .toBeGreaterThan(before);
  // Opening another menu also leaves scrolling available.
  await page.keyboard.press("Escape");
  await category.click();
  const menu = page.getByRole("listbox");
  const bounds = (await menu.boundingBox())!;
  await page.mouse.move(
    bounds.x + bounds.width / 2,
    bounds.y + bounds.height / 2,
  );
  const pagePosition = await page.evaluate(() => window.scrollY);
  const menuBeforeWheel = (await menu.boundingBox())!;
  await page.mouse.wheel(0, 600);
  await expect
    .poll(() => menu.evaluate((element) => element.scrollTop))
    .toBeGreaterThan(100);
  expect(await page.evaluate(() => window.scrollY)).toBe(pagePosition);
  const menuAfterWheel = (await menu.boundingBox())!;
  expect(menuAfterWheel.x).toBe(menuBeforeWheel.x);
  expect(menuAfterWheel.y).toBe(menuBeforeWheel.y);
  expect(menuAfterWheel.height).toBe(menuBeforeWheel.height);
  await page.keyboard.press("End");
  await page.keyboard.press("Enter");
  await expect(category).toHaveText("Subject 23");
  await expect(page.getByRole("listbox")).toHaveCount(0);
  await category.click();
  await page.keyboard.press("Home");
  await page.keyboard.press("Enter");
  const sort = page.getByRole("combobox", {
    name: "Sort flashcard decks",
    exact: true,
  });
  await sort.click();
  await page.mouse.move(
    page.viewportSize()!.width - 20,
    page.viewportSize()!.height - 20,
  );
  const sortPosition = await page.evaluate(() => window.scrollY);
  await page.mouse.wheel(0, 100);
  await expect
    .poll(() => page.evaluate(() => window.scrollY))
    .toBeGreaterThan(sortPosition);
  await page.keyboard.press("Escape");
  await page.setViewportSize({ width: 320, height: 844 });
  await category.scrollIntoViewIfNeeded();
  await category.click();
  const mobileTrigger = (await category.boundingBox())!;
  const mobileMenu = (await page.getByRole("listbox").boundingBox())!;
  expect(Math.abs(mobileMenu.x - mobileTrigger.x)).toBeLessThan(1);
  expect(Math.abs(mobileMenu.width - mobileTrigger.width)).toBeLessThan(1);
  await expect(page.getByRole("listbox")).toBeInViewport({ ratio: 1 });
});

test("the study-mode filter shows only the selected emoji rating and updates after rerating", async ({
  page,
}) => {
  await readyOffline(page);
  await importFixture(page, {
    ...fixture,
    questions: fixture.questions.slice(0, 3),
  });
  await page.getByRole("button", { name: fixture.title, exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  const filter = page.getByRole("combobox", {
    name: "Flashcard rating filter",
    exact: true,
  });
  await filter.click();
  await expect(page.getByRole("listbox")).toBeInViewport({ ratio: 1 });
  const triggerBounds = (await filter.boundingBox())!;
  const menuBounds = (await page.getByRole("listbox").boundingBox())!;
  expect(Math.abs(menuBounds.width - triggerBounds.width)).toBeLessThan(1);
  expect(Math.abs(menuBounds.x - triggerBounds.x)).toBeLessThan(1);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("listbox")).toHaveCount(0);
  await expect(
    page.getByRole("dialog", { name: "Flashcard study mode" }),
  ).toBeVisible();
  const chooseFilter = async (value: string) => {
    await filter.click();
    const label = value === "all" ? "All cards" : value.toUpperCase();
    await page.getByRole("option").filter({ hasText: label }).click();
  };
  const front = page.locator('.flashcard-front[aria-hidden="false"]');
  await expect(filter).toHaveText("All cards");
  await chooseFilter("bad");
  await expect(
    page.getByRole("heading", { name: "No BAD cards yet" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Show all cards", exact: true })
    .click();
  await page.getByRole("button", { name: "BAD", exact: true }).click();
  await page.getByRole("button", { name: "Next card", exact: true }).click();
  await expect(front).toContainText("Water is a liquid");
  await page.getByRole("button", { name: "BAD", exact: true }).click();
  await chooseFilter("bad");
  await expect(front).toContainText("Pick the planet");
  await expect(page.getByText("Card 1 of 2", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Next card", exact: true }).click();
  await expect(front).toContainText("Water is a liquid");
  await page.getByRole("button", { name: "GOOD", exact: true }).click();
  // The GOOD card immediately leaves the Angry/BAD filter.
  await expect(front).toContainText("Pick the planet");
  await expect(page.getByText("Card 1 of 1", { exact: true })).toBeVisible();
  await chooseFilter("good");
  await expect(front).toContainText("Water is a liquid");
  await expect(page.getByText("Card 1 of 1", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "SATISFIED", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "No good cards yet" }),
  ).toBeVisible();
  await chooseFilter("satisfied");
  await expect(front).toContainText("Water is a liquid");
  await chooseFilter("all");
  await expect(front).toContainText("Pick the planet");
  await expect(page.getByText("Card 1 of 3", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Start again", exact: true }).click();
  await expect(filter).toHaveText("All cards");
  await chooseFilter("bad");
  await expect(
    page.getByRole("heading", { name: "No BAD cards yet" }),
  ).toBeVisible();
});
