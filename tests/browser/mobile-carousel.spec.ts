import { test, expect } from "@playwright/test";
import { loadLayoutFixtures } from "./layout-fixture";

for (const width of [320, 390, 760]) {
  test(`quiz carousel and home content fit at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.addInitScript(() =>
      localStorage.setItem("quizcraft-theme", "dark"),
    );
    await loadLayoutFixtures(page);
    const carousel = page
      .getByRole("region", { name: "Quizzes", exact: true })
      .first();
    await expect(carousel.locator(".quiz-card").first()).toBeVisible();
    expect(await carousel.locator(".quiz-card").count()).toBeGreaterThan(1);
    const boxes = await carousel.locator(".quiz-card").evaluateAll((cards) =>
      cards.slice(0, 2).map((card) => ({
        x: card.getBoundingClientRect().x,
        y: card.getBoundingClientRect().y,
      })),
    );
    expect(boxes[0].y).toBe(boxes[1].y);
    expect(boxes[1].x).toBeGreaterThan(boxes[0].x);
    await carousel.evaluate((el) => el.scrollTo({ left: el.clientWidth }));
    await expect
      .poll(() => carousel.evaluate((el) => el.scrollLeft))
      .toBeGreaterThan(0);
    await expect
      .poll(() =>
        page.evaluate(() => document.documentElement.scrollWidth - innerWidth),
      )
      .toBeLessThanOrEqual(1);
    await expect(page.locator(".hero")).toHaveCount(0);
    await expect(page.locator(".welcome-line, .value-strip")).toHaveCount(0);
  });
}

test("desktop keeps the quiz grid", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await loadLayoutFixtures(page);
  const grid = page
    .getByRole("region", { name: "Quizzes", exact: true })
    .first();
  await expect(grid.locator(".quiz-card").first()).toBeVisible();
  expect(await grid.evaluate((el) => getComputedStyle(el).gridAutoFlow)).toBe(
    "row",
  );
  expect(
    await grid.evaluate((el) => el.scrollWidth - el.clientWidth),
  ).toBeLessThanOrEqual(1);
});

test("home sections stay aligned while resizing through phone, tablet, and desktop widths", async ({
  page,
}) => {
  await page.addInitScript(() =>
    localStorage.setItem("quizcraft-theme", "dark"),
  );
  await loadLayoutFixtures(page);
  await expect(page.locator(".hero")).toHaveCount(0);
  for (const width of [
    320, 390, 600, 650, 720, 760, 810, 900, 980, 1170, 1440,
  ]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(page.locator(".welcome-line, .value-strip")).toHaveCount(0);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - innerWidth,
    );
    expect(overflow, `page width at ${width}px`).toBeLessThanOrEqual(1);
  }
});
