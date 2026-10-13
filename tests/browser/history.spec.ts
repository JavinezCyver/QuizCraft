import { test, expect } from "@playwright/test";

test("history shows the latest score once per quiz while keeping other quizzes", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 844 });
  await page.request.post("/api/auth/register", {
    data: {
      email: `retake-${Date.now()}@example.test`,
      name: "Retake learner",
      password: "retake-password",
    },
  });
  async function create(title: string) {
    const { id } = await (
      await page.request.post("/api/quizzes", { data: {} })
    ).json();
    const draft = await (await page.request.get("/api/quizzes/" + id)).json();
    expect(
      (
        await page.request.put("/api/quizzes/" + id, {
          data: {
            ...draft,
            title,
            status: "published",
            questions: [1, 2, 3].map((n) => ({
              type: "blank",
              prompt: `Question ${n}`,
              options: [],
              accepted: ["Answer"],
              points: 10,
            })),
          },
        })
      ).ok(),
    ).toBe(true);
    return id;
  }
  async function take(id: string, correct: number) {
    const attempt = await (
      await page.request.post(`/api/quizzes/${id}/start`, { data: {} })
    ).json();
    await page.request.post(`/api/attempts/${attempt.id}/submit`, {
      data: {
        answers: Object.fromEntries(
          attempt.questions.map((q: { id: string }, i: number) => [
            q.id,
            i < correct ? "Answer" : "Wrong",
          ]),
        ),
      },
    });
  }
  async function navigate(name: string) {
    await page
      .getByRole("button", { name: "Open navigation", exact: true })
      .click();
    await page
      .locator("#quizcraft-navigation")
      .getByRole("button", { name, exact: true })
      .click();
  }
  const quiz = await create("Retake practice"),
    other = await create("Other practice");
  await take(quiz, 1);
  await take(other, 3);
  await page.goto("/");
  await navigate("Quiz history");
  const row = page
    .locator(".history-table-row")
    .filter({ hasText: "Retake practice" });
  await expect(row.locator("strong")).toHaveText("33%");
  await take(quiz, 2);
  await navigate("My dashboard");
  await navigate("Quiz history");
  await expect(row).toHaveCount(1);
  await expect(row.locator("strong")).toHaveText("67%");
  await expect(row.locator("time")).toBeVisible();
  await expect(row.locator("time")).toHaveAttribute(
    "datetime",
    /\d{4}-\d{2}-\d{2}T/,
  );
  await expect(row.locator("time")).toBeInViewport();
  await page.setViewportSize({ width: 320, height: 568 });
  await expect(row.locator("time")).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - innerWidth,
    ),
  ).toBeLessThanOrEqual(1);
  await expect(page.locator(".history-table-row")).toHaveCount(2);
  await expect(
    page
      .locator(".history-table-row")
      .filter({ hasText: "Other practice" })
      .locator("strong"),
  ).toHaveText("100%");
  // It is the latest result, even when the latest score is lower.
  await take(quiz, 0);
  await navigate("My dashboard");
  await navigate("Quiz history");
  await expect(row.locator("strong")).toHaveText("0%");
  await expect(row).toHaveCount(1);
  await expect(page.locator(".history-table-row")).toHaveCount(2);
  expect(
    (await (await page.request.get("/api/library")).json()).attempts,
  ).toHaveLength(4);
});
