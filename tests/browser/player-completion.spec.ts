import { test, expect } from "@playwright/test";

test("unanswered and skipped questions block finishing; completion offers review from any question", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 844 });
  await page.request.post("/api/auth/register", {
    data: { email: `completion-${Date.now()}@example.test`, name: "Completion learner", password: "completion-password" },
  });
  const { id } = await (await page.request.post("/api/quizzes", { data: {} })).json();
  const quiz = await (await page.request.get(`/api/quizzes/${id}`)).json();
  await page.request.put(`/api/quizzes/${id}`, {
    data: {
      ...quiz, title: "Complete every answer", status: "published",
      settings: { ...quiz.settings, time: 0, review: true, randomQuestions: false, layout: "single" },
      questions: [1, 2, 3].map(n => ({ type: "blank", prompt: `Question ${n}`, options: [], accepted: [`Answer ${n}`], points: 10 })),
    },
  });
  await page.goto(`/?quiz=${id}`);
  await page.getByRole("button", { name: /get started/ }).click();
  const next = page.getByRole("button", { name: "Next question", exact: true });
  const answer = page.getByRole("textbox", { name: "Your answer", exact: true });
  await expect(next).toBeDisabled();
  await answer.fill("   ");
  await expect(next).toBeDisabled();
  await answer.fill("Answer 1");
  await next.click();
  await page.getByRole("button", { name: "Go to question 3", exact: true }).click();
  await expect(next).toBeDisabled();
  await answer.fill("Answer 3");
  await expect(page.getByRole("button", { name: "Review answers", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Submit quiz", exact: true })).toHaveCount(0);
  await next.click();
  await expect(page.getByRole("heading", { name: "Question 2", exact: true })).toBeVisible();
  await answer.fill("Answer 2");
  await expect(next).toHaveCount(0);
  await page.getByRole("button", { name: "Go to question 1", exact: true }).click();
  await page.getByRole("button", { name: "Review answers", exact: true }).click();
  const submit = page.getByRole("button", { name: "Submit quiz", exact: true });
  await expect(submit).toBeEnabled();
  await page.locator(".review-line").first().click();
  await answer.fill("");
  await expect(next).toBeDisabled();
  await answer.fill("Answer 1");
  await page.getByRole("button", { name: "Review answers", exact: true }).click();
  await submit.click();
  await expect(page.getByText("30/30", { exact: true })).toBeVisible();
});
