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
  await page
    .getByRole("button", { name: "Open settings", exact: true })
    .click();
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
  await page
    .getByRole("button", { name: "Open settings", exact: true })
    .click();
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
  await page
    .locator(".topbar")
    .getByRole("button", { name: "Create a Quiz", exact: true })
    .click();
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
test("takes all question types, enforces answers, grades locally, restores history, and deletes", async ({
  page,
}) => {
  await readyOffline(page);
  await importFixture(page);
  await page.getByRole("button", { name: fixture.title, exact: true }).click();
  await page.getByRole("button", { name: /get started/ }).click();
  await expect(
    page.getByRole("button", { name: "Next question", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "A Mars", exact: true }).click();
  await page
    .getByRole("button", { name: "Next question", exact: true })
    .click();
  await page.getByRole("button", { name: "A True", exact: true }).click();
  await page
    .getByRole("button", { name: "Next question", exact: true })
    .click();
  await page.getByLabel("Your answer", { exact: true }).fill("  THE   SUN  ");
  await page
    .getByRole("button", { name: "Next question", exact: true })
    .click();
  await page.getByLabel("Your answer", { exact: true }).fill("Review each day");
  await page
    .getByRole("button", { name: "Review answers", exact: true })
    .click();
  await page.getByRole("button", { name: "Submit quiz", exact: true }).click();
  await expect(page.locator(".result-summary")).toContainText("75");
  await page.getByRole("button", { name: "My quizzes", exact: true }).click();
  await page.locator(".grading-row").getByRole("spinbutton").fill("10");
  await page.getByRole("button", { name: "Save grade", exact: true }).click();
  await expect(page.locator(".grading-row")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Open settings", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Export backup", exact: true })
    .click();
  const backup = await page.getByLabel("Quiz or backup JSON").inputValue();
  expect(JSON.parse(backup).attempts[0].result.score).toBe(40);
  await page
    .getByRole("button", {
      name: "Restore backup and replace local data",
      exact: true,
    })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.reload();
  await page.getByRole("button", { name: "Quiz history", exact: true }).click();
  await expect(page.locator(".history-table-row")).toContainText("100%");
  await page.getByRole("button", { name: "My quizzes", exact: true }).click();
  const row = page.locator(".quiz-card").filter({ hasText: fixture.title });
  await expect(page.locator(".quiz-manage-row")).toHaveCount(0);
  await expect(
    row.getByRole("button", { name: "Edit quiz", exact: true }),
  ).toBeVisible();
  await expect(
    row.getByRole("button", { name: "Export quiz", exact: true }),
  ).toBeVisible();
  await expect(
    row.getByRole("button", { name: "Duplicate", exact: true }),
  ).toBeVisible();
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
  await card.getByRole("button", { name: "Flashcards", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("Pick the planet");
  await page.locator("button.flashcard").click();
  await expect(page.locator(".flashcard-back")).toContainText("Mars");
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("dialog")).toContainText("Water is a liquid");
  await page.keyboard.press("Escape");
  await page
    .getByRole("button", { name: "Open settings", exact: true })
    .click();
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

test("a quiz timer submits locally when time expires", async ({ page }) => {
  await page.clock.install();
  await readyOffline(page);
  await importFixture(page, {
    ...fixture,
    settings: { ...settings, time: 1 },
    questions: [fixture.questions[1]],
  });
  await page.getByRole("button", { name: fixture.title, exact: true }).click();
  await page.getByRole("button", { name: /get started/ }).click();
  await expect(page.locator(".timer")).toBeVisible();
  await page.clock.fastForward(61000);
  await expect(page.locator(".result-summary")).toBeVisible();
  const data = await readData(page);
  expect(data.attempts[0].result.score).toBe(0);
  expect(data.attempts[0].result.maximum).toBe(10);
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
  await page
    .locator(".topbar")
    .getByRole("button", { name: "Create a Quiz", exact: true })
    .click();
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
    await page
      .locator(".topbar")
      .getByRole("button", { name: "Create a Quiz", exact: true })
      .tap();
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
  ).toHaveValue("Pick the planet");
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
  ).toHaveValue("Second question: multiple choice");
  await page
    .getByRole("button", { name: "Previous question", exact: true })
    .click();
  await expect(
    page.getByRole("combobox", { name: "Question type", exact: true }),
  ).toContainText("True or false");
  await expect(
    page.getByRole("textbox", { name: "Your question", exact: true }),
  ).toHaveValue("First question: true or false");
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
  ).toHaveValue("");
  await expect(
    page.getByRole("textbox", { name: "Answer explanation", exact: true }),
  ).toHaveValue("");
  await expect(
    page.getByRole("combobox", { name: "Question type", exact: true }),
  ).toContainText("Multiple choice");
  for (let i = 1; i <= 4; i++)
    await expect(
      page.getByRole("textbox", { name: `Option ${i}`, exact: true }),
    ).toHaveValue("");
  await expect(
    page.getByRole("radio", { name: "Mark option 1 correct", exact: true }),
  ).not.toBeChecked();
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  const questions = (await readData(page)).quizzes[0].questions;
  expect(questions).toHaveLength(2);
  expect(questions[0].prompt).toBe("Water is a liquid");
  expect(questions[0].accepted).toEqual(["True"]);
  expect(questions[1].id).not.toBe(questions[0].id);
  expect(questions[1].accepted).toEqual([]);
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

test("large cover photos are resized, displayed, and retained offline after reload", async ({
  page,
}) => {
  await readyOffline(page);
  await page
    .locator(".topbar")
    .getByRole("button", { name: "Create a Quiz", exact: true })
    .click();
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
  expect(
    await card
      .locator(".quiz-cover")
      .evaluate((element) => getComputedStyle(element).backgroundImage),
  ).toContain("data:image/jpeg;base64,");
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
  await page
    .getByRole("button", { name: "Open settings", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await back();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page
    .locator(".topbar")
    .getByRole("button", { name: "Create a Quiz", exact: true })
    .click();
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
    page.getByRole("heading", {
      name: "What will you discover today?",
      exact: false,
    }),
  ).toBeVisible();
  await back();
  await expect(
    page.getByRole("heading", {
      name: "What will you discover today?",
      exact: false,
    }),
  ).toBeVisible();
});

test("flashcards return to Discover or My quizzes according to their starting page", async ({
  page,
}) => {
  await readyOffline(page);
  await importFixture(page);
  const openCards = () =>
    page
      .locator(".quiz-card")
      .filter({
        has: page.getByRole("button", { name: fixture.title, exact: true }),
      })
      .first()
      .getByRole("button", { name: "Flashcards", exact: true })
      .click();
  await page.getByRole("button", { name: "Discover", exact: true }).click();
  await openCards();
  await page
    .getByRole("button", { name: "Back to discover", exact: true })
    .click();
  await expect(
    page.getByRole("heading", {
      name: "What will you discover today?",
      exact: false,
    }),
  ).toBeVisible();
  await openCards();
  await page.evaluate(() => window.dispatchEvent(new Event("quizcraft-back")));
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.getByRole("heading", {
      name: "What will you discover today?",
      exact: false,
    }),
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
