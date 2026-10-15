import type { Page } from "@playwright/test";

export async function openSettings(page: Page) {
  const toggle = page.getByRole("button", {
    name: "Open navigation",
    exact: true,
    includeHidden: true,
  });
  await toggle.waitFor({ state: "attached" });
  if (
    (await toggle.isVisible()) &&
    (await toggle.getAttribute("aria-expanded")) !== "true"
  ) {
    await toggle.click();
  }
  await page.getByRole("button", { name: "Settings", exact: true }).click();
}

export async function createQuiz(page: Page) {
  const toggle = page.getByRole("button", {
    name: "Open navigation",
    exact: true,
    includeHidden: true,
  });
  await toggle.waitFor({ state: "attached" });
  if (
    (await toggle.isVisible()) &&
    (await toggle.getAttribute("aria-expanded")) !== "true"
  ) {
    await toggle.click();
  }
  await page.getByRole("button", { name: "My quizzes", exact: true }).click();
  await page
    .locator("main .page-title")
    .getByRole("button", { name: "Create a quiz", exact: true })
    .click();
}
