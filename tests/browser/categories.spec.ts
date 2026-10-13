import { test, expect } from "@playwright/test";

test("a medical creator adds a category, reopens it and publishes to Discover", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 844 });
  const registration = await page.request.post("/api/auth/register", {
    data: {
      email: `medical-${Date.now()}@example.test`,
      name: "Medical learner",
      password: "medical-password",
    },
  });
  const creator = await registration.json();
  // Isolate this creator's real published feed from other test fixtures.
  await page.route("**/api/quizzes", async (route) => {
    const response = await route.fetch();
    const quizzes = await response.json();
    await route.fulfill({
      response,
      json: quizzes.filter((q: { owner: string }) => q.owner === creator.id),
    });
  });
  const { id } = await (
    await page.request.post("/api/quizzes", { data: {} })
  ).json();
  const draft = await (await page.request.get("/api/quizzes/" + id)).json();
  await page.request.put("/api/quizzes/" + id, {
    data: {
      ...draft,
      title: "Medication safety review",
      questions: [
        {
          type: "blank",
          prompt: "Name the antidote for acetaminophen overdose.",
          options: [],
          accepted: ["N-acetylcysteine"],
          points: 10,
        },
      ],
    },
  });
  await page.goto("/");
  await expect(
    page.getByRole("heading", {
      name: "No quizzes published yet",
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.locator("#explore .category-tabs button")).toHaveCount(1);
  async function navigate(name: string) {
    await page
      .getByRole("button", { name: "Open navigation", exact: true })
      .click();
    await page
      .locator("#quizcraft-navigation")
      .getByRole("button", { name, exact: true })
      .click();
  }
  await navigate("My quizzes");
  await page.getByRole("button", { name: "Edit quiz", exact: true }).click();
  await page.getByRole("combobox", { name: "Quiz category" }).click();
  await expect(page.getByRole("option")).toHaveText(["General Knowledge"]);
  await expect(
    page.getByRole("option", { name: "Education", exact: true }),
  ).toHaveCount(0);
  await page.keyboard.press("Escape");
  await page
    .getByLabel("New category", { exact: true })
    .fill("Clinical Pharmacology");
  await page.getByRole("button", { name: "Add category", exact: true }).click();
  await expect(
    page.getByRole("combobox", { name: "Quiz category" }),
  ).toHaveText("Clinical Pharmacology");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - innerWidth,
    ),
  ).toBeLessThanOrEqual(1);
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await page.getByRole("combobox", { name: "Flashcard category" }).click();
  await page
    .getByRole("option", { name: "Clinical Pharmacology", exact: true })
    .click();
  await expect(page.locator(".quiz-card .card-title")).toHaveText([
    "Medication safety review",
  ]);
  await navigate("Discover");
  await expect(page.locator("#explore .category-tabs button")).toHaveCount(1);
  await expect(
    page
      .locator(".quiz-card .card-title")
      .filter({ hasText: "Medication safety review" }),
  ).toHaveCount(0);
  await navigate("My quizzes");
  await page.getByRole("button", { name: "Edit quiz", exact: true }).click();
  await expect(
    page.getByRole("combobox", { name: "Quiz category" }),
  ).toHaveText("Clinical Pharmacology");
  await page
    .getByRole("button", { name: "Publish quiz", exact: true })
    .first()
    .click();
  await expect(
    page.getByRole("heading", { name: "Made by you", exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(page.locator("#explore .category-tabs button")).toHaveCount(2);
  await expect(
    page
      .locator("#explore .category-tabs")
      .getByRole("button", { name: "Education", exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Clinical Pharmacology", exact: true })
    .click();
  await expect(page.locator(".quiz-card .card-title")).toHaveText([
    "Medication safety review",
  ]);
  await expect(
    page
      .locator(".recent-card")
      .filter({ hasText: "Medication safety review" }),
  ).toBeVisible();
});
