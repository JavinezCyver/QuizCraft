import { test, expect } from "@playwright/test";

test("own published cards offer flashcards in Discover", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 844 });
  await page.request.post("/api/auth/register", {
    data: { email: `published-flashcards-${Date.now()}@example.test`, name: "Published learner", password: "flashcard-password" },
  });
  const { id } = await (await page.request.post("/api/quizzes", { data: {} })).json();
  const quiz = await (await page.request.get(`/api/quizzes/${id}`)).json();
  await page.request.put(`/api/quizzes/${id}`, {
    data: { ...quiz, title: "Published study deck", status: "published", visibility: "public", questions: [
      { type: "blank", prompt: "Published question", options: [], accepted: ["Published answer"], points: 10 },
    ] },
  });
  await page.goto("/");
  await page.getByRole("textbox", { name: "Search quizzes", exact: true }).fill("Published study deck");
  const card = page.locator(".quiz-card").filter({ has: page.getByRole("button", { name: "Published study deck", exact: true }) });
  await card.getByRole("button", { name: "Flashcards", exact: true }).click();
  await page.getByRole("button", { name: "Reveal answer: Published question", exact: true }).click();
  await expect(page.locator('.flashcard-back[aria-hidden="false"]')).toContainText("Published answer");
  await page.keyboard.press("Escape");
  await page.request.post("/api/auth/logout");
  await page.goto("/");
  await page.getByRole("textbox", { name: "Search quizzes", exact: true }).fill("Published study deck");
  await expect(card).toBeVisible();
  await expect(card.getByRole("button", { name: "Flashcards", exact: true })).toHaveCount(0);
});

test("flashcard decks filter and sort by category on mobile", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 844 });
  await page.request.post("/api/auth/register", {
    data: {
      email: `categories-${Date.now()}@example.test`,
      name: "Study categories",
      password: "flashcard-password",
    },
  });
  for (const [title, category] of [
    ["Coding practice", "Technology"],
    ["Plant science", "Science"],
  ]) {
    const { id } = await (
      await page.request.post("/api/quizzes", { data: {} })
    ).json();
    const quiz = await (await page.request.get("/api/quizzes/" + id)).json();
    await page.request.put("/api/quizzes/" + id, {
      data: {
        ...quiz,
        title,
        category,
        questions: [
          {
            type: "blank",
            prompt: `${category} question`,
            options: [],
            accepted: ["Answer"],
            points: 10,
          },
        ],
      },
    });
  }
  await page.goto("/");
  await page
    .getByRole("button", { name: "Open navigation", exact: true })
    .click();
  await page.getByRole("button", { name: "My quizzes", exact: true }).click();
  const titles = page.locator(".quiz-card .card-title");
  await page.getByRole("combobox", { name: "Sort flashcard decks" }).click();
  await page.getByRole("option", { name: "Category (A-Z)" }).click();
  await expect(titles).toHaveText(["Plant science", "Coding practice"]);
  await page.getByRole("combobox", { name: "Flashcard category" }).click();
  await page.getByRole("option", { name: "Science", exact: true }).click();
  await expect(titles).toHaveText(["Plant science"]);
  await expect(page.locator(".quiz-manage-row")).toHaveCount(1);
  await page.getByRole("button", { name: "Flashcards", exact: true }).click();
  await expect(
    page.getByRole("button", {
      name: "Reveal answer: Science question",
      exact: true,
    }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("combobox", { name: "Flashcard category" }),
  ).toHaveText("Science");
  await page.getByRole("button", { name: "Published", exact: true }).click();
  await expect(
    page.getByText("No quizzes match your filters", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Clear filters", exact: true })
    .click();
  await expect(titles).toHaveText(["Plant science", "Coding practice"]);
  await page.getByRole("combobox", { name: "Flashcard category" }).click();
  await expect(page.getByRole("option")).toHaveText([
    "All categories",
    "Science",
    "Technology",
  ]);
  await expect(
    page.getByRole("option", { name: "Mathematics", exact: true }),
  ).toHaveCount(0);
  await page.keyboard.press("Escape");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - innerWidth,
    ),
  ).toBeLessThanOrEqual(1);
});

test("flashcards flip, swipe, navigate by keyboard and stay out of history", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 900 });
  await page.request.post("/api/auth/register", {
    data: {
      email: `flashcards-${Date.now()}@example.test`,
      name: "Flashcard learner",
      password: "flashcard-password",
    },
  });
  const { id } = await (
    await page.request.post("/api/quizzes", { data: {} })
  ).json();
  const quiz = await (await page.request.get("/api/quizzes/" + id)).json();
  await page.request.put("/api/quizzes/" + id, {
    data: {
      ...quiz,
      title: "Science study deck",
      questions: [
        {
          type: "multiple",
          prompt: "Which planet has prominent rings?",
          options: ["Saturn", "Mars"],
          accepted: ["Saturn"],
          correctOption: 0,
          explanation: "Saturn’s rings contain ice and rock.",
          points: 10,
        },
        {
          type: "blank",
          prompt: "What gas do plants absorb?",
          options: [],
          accepted: ["Carbon dioxide", "CO2"],
          explanation: "Plants use it in photosynthesis.",
          points: 10,
        },
        {
          type: "short",
          prompt: "Explain an ecosystem.",
          options: [],
          accepted: [],
          explanation: "",
          points: 10,
        },
      ],
    },
  });
  await page.goto("/");
  await page
    .getByRole("button", { name: "Open navigation", exact: true })
    .click();
  await page.getByRole("button", { name: "My quizzes", exact: true }).click();
  await page.getByRole("button", { name: "Flashcards", exact: true }).click();
  await expect(
    page.getByRole("dialog", { name: "Flashcard study mode", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Card 1 of 3", { exact: true })).toBeVisible();
  await expect(page.locator("#root")).toHaveAttribute("aria-hidden", "true");
  expect(
    await page
      .locator(".flashcards-backdrop")
      .evaluate((el) => getComputedStyle(el).backdropFilter),
  ).toContain("blur");
  const card = page.locator(".flashcard");
  await expect(card).toHaveAttribute("aria-pressed", "false");
  await card.click();
  await expect(card).toHaveAttribute("aria-pressed", "true");
  await expect(
    page.locator('.flashcard-back[aria-hidden="false"]'),
  ).toContainText("Saturn");
  await page.screenshot({
    path: "test-results/flashcards-mobile.png",
    fullPage: true,
    animations: "disabled",
  });
  await card.click();
  await expect(card).toHaveAttribute("aria-pressed", "false");
  const bounds = await card.boundingBox();
  expect(bounds).not.toBeNull();
  await page.mouse.move(bounds!.x + bounds!.width * 0.8, bounds!.y + 100);
  await page.mouse.down();
  await page.mouse.move(bounds!.x + bounds!.width * 0.2, bounds!.y + 100, {
    steps: 8,
  });
  await page.mouse.up();
  await expect(page.getByText("Card 2 of 3", { exact: true })).toBeVisible();
  await expect(card).toHaveAttribute("aria-pressed", "false");
  await card.evaluate((el) =>
    Promise.all(
      el
        .getAnimations({ subtree: true })
        .map((animation) => animation.finished),
    ),
  );
  // Text must return to a flat layer after the navigation flip.
  await expect(page.locator(".flashcard-inner")).toHaveCSS("transform", "none");
  await card.press("Enter");
  await expect(
    page.locator('.flashcard-back[aria-hidden="false"]'),
  ).toContainText("Carbon dioxide / CO2");
  await card.press("ArrowRight");
  await expect(page.getByText("Card 3 of 3", { exact: true })).toBeVisible();
  await card.click();
  await expect(
    page.locator('.flashcard-back[aria-hidden="false"]'),
  ).toContainText("No answer set yet");
  await expect(
    page.getByRole("button", { name: "Next card", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Start again", exact: true }).click();
  await expect(page.getByText("Card 1 of 3", { exact: true })).toBeVisible();
  await expect(card).toHaveAttribute("aria-pressed", "false");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(
    (await (await page.request.get("/api/library")).json()).attempts,
  ).toHaveLength(0);
  await card.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator("#root")).not.toHaveAttribute(
    "aria-hidden",
    "true",
  );
  await expect(
    page.getByRole("heading", { name: "Made by you", exact: true }),
  ).toBeVisible();
});

test("an empty deck points back to the editor", async ({ page }) => {
  await page.request.post("/api/auth/register", {
    data: {
      email: `empty-deck-${Date.now()}@example.test`,
      name: "Empty deck",
      password: "empty-deck-password",
    },
  });
  await page.request.post("/api/quizzes", { data: {} });
  await page.goto("/");
  await page.getByRole("button", { name: "My quizzes", exact: true }).click();
  await page.getByRole("button", { name: "Flashcards", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Your deck is waiting", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Add questions", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: /Quiz creation studio/ }),
  ).toBeVisible();
});
