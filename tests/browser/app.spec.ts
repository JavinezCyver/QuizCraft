import { test, expect } from "@playwright/test";
for (const width of [320, 375, 768, 1440]) {
  test(`responsive discovery at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: "Create. Share. Challenge Yourself." }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", {
        name: "A journey through the cosmos",
        exact: true,
      }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `test-results/discovery-${width}.png`,
      fullPage: true,
    });
    await page.getByRole("textbox", { name: "Search quizzes" }).fill("cosmos");
    await expect(
      page.getByRole("button", {
        name: "A journey through the cosmos",
        exact: true,
      }),
    ).toHaveCount(1);
    await expect(
      page.getByRole("button", {
        name: "Think you know good design?",
        exact: true,
      }),
    ).toHaveCount(0);
    await page
      .getByRole("textbox", { name: "Search quizzes" })
      .fill("nothing-matches-xyz");
    await expect(
      page.getByRole("heading", { name: "No quizzes found" }),
    ).toBeVisible();
  });
}
test("guest takes quiz and reviews results", async ({ page }) => {
  await page.goto("/?quiz=cosmos");
  await page.getByRole("button", { name: "Let’s get started" }).click();
  for (const answer of ["Saturn", "The Sun", "Gravity", "Milky Way"]) {
    await page.getByRole("button", { name: new RegExp(answer) }).click();
    if (answer !== "Milky Way")
      await page.getByRole("button", { name: "Next question" }).click();
  }
  await page.getByRole("button", { name: "Review answers" }).click();
  await page.getByRole("button", { name: "Submit quiz", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Nicely done!" }),
  ).toBeVisible();
  await expect(page.getByText("40/40", { exact: true })).toBeVisible();
  await page.screenshot({
    path: "test-results/quiz-results.png",
    fullPage: true,
  });
});
test("register, create, preview, publish and save a quiz", async ({ page }) => {
  await page.goto("/");
  await page
    .locator(".hero")
    .getByRole("button", { name: "Create a Quiz" })
    .click();
  await page.getByLabel("Your name", { exact: true }).fill("Browser Tester");
  await page
    .getByLabel("Email address")
    .fill(`browser-${Date.now()}@example.test`);
  await page
    .getByLabel("Password", { exact: true })
    .fill("browser-password-123");
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page
    .locator(".hero")
    .getByRole("button", { name: "Create a Quiz" })
    .click();
  await page
    .getByLabel("Quiz title", { exact: true })
    .fill("Browser science challenge");
  await page.getByRole("button", { name: "Add first question" }).click();
  await page
    .getByLabel("Your question", { exact: true })
    .fill("What is 1 + 1?");
  await page.getByRole("textbox", { name: "Option 1", exact: true }).fill("2");
  await page.getByRole("textbox", { name: "Option 2", exact: true }).fill("3");
  await page.getByRole("textbox", { name: "Option 3", exact: true }).fill("4");
  await page.getByRole("textbox", { name: "Option 4", exact: true }).fill("5");
  await page
    .getByRole("radio", { name: "Mark option 1 correct", exact: true })
    .check();
  await page.getByRole("button", { name: "Preview", exact: true }).click();
  await page.getByRole("button", { name: "Let’s get started" }).click();
  await page.getByRole("button", { name: "A 2", exact: true }).click();
  await page.getByRole("button", { name: "Review answers" }).click();
  await page.getByRole("button", { name: "Submit quiz", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Nicely done!" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Back to editor" }).click();
  await page.getByRole("button", { name: "Publish quiz", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Made by you" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Discover", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Search quizzes" })
    .fill("Browser science challenge");
  await expect(
    page.getByRole("button", {
      name: "Browser science challenge",
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Bookmark quiz", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Saved quizzes", exact: false })
    .click();
  await expect(
    page.getByRole("button", {
      name: "Browser science challenge",
      exact: true,
    }),
  ).toBeVisible();
});
test("delete confirmation can be canceled and removes an owned quiz", async ({
  page,
}) => {
  await page.request.post("/api/auth/register", {
    data: {
      name: "Delete tester",
      email: `delete-${Date.now()}@example.test`,
      password: "delete-test-password",
    },
  });
  const response = await page.request.post("/api/quizzes", { data: {} });
  const { id } = await response.json();
  await page.goto("/");
  await page.getByRole("button", { name: "My quizzes", exact: true }).click();
  await page
    .getByRole("button", { name: "Untitled quiz", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Back to my quizzes", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Made by you", exact: true }),
  ).toBeVisible();
  await page
    .locator(".quiz-manage-row")
    .getByRole("button", { name: "Delete", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Delete this quiz?" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Untitled quiz", exact: true }),
  ).toBeVisible();
  await page
    .locator(".quiz-manage-row")
    .getByRole("button", { name: "Delete", exact: true })
    .click();
  await page.getByRole("button", { name: "Delete quiz", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Your ideas deserve a quiz" }),
  ).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "My quizzes", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Untitled quiz", exact: true }),
  ).toHaveCount(0);
  expect((await page.request.get("/api/quizzes/" + id)).status()).toBe(404);
});
test("mobile menu, dark mode and keyboard dialog", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/");
  await page.getByRole("button", { name: "Open navigation" }).click();
  await page.getByRole("button", { name: "Dark mode", exact: true }).click();
  await expect(page.locator("html")).toHaveClass("dark");
  await page.getByRole("button", { name: "Close menu" }).click();
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});
