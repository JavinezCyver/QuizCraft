import { test, expect } from "@playwright/test";

for (const width of [320, 390, 760]) {
  test(`quiz carousel and home content fit at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.addInitScript(() => localStorage.setItem("quizcraft-theme", "dark"));
    await page.goto("/");
    const carousel = page.getByRole("region", { name: "Quizzes", exact: true }).first();
    await expect(carousel.locator(".quiz-card").first()).toBeVisible();
    expect(await carousel.locator(".quiz-card").count()).toBeGreaterThan(1);
    const boxes = await carousel.locator(".quiz-card").evaluateAll(cards =>
      cards.slice(0, 2).map(card => ({ x: card.getBoundingClientRect().x, y: card.getBoundingClientRect().y })),
    );
    expect(boxes[0].y).toBe(boxes[1].y);
    expect(boxes[1].x).toBeGreaterThan(boxes[0].x);
    await carousel.evaluate(el => el.scrollTo({ left: el.clientWidth }));
    await expect.poll(() => carousel.evaluate(el => el.scrollLeft)).toBeGreaterThan(0);
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    expect(await page.locator(".hero").evaluate(el => getComputedStyle(el).overflow)).toBe("clip");
    expect(await page.locator(".value-strip").evaluate(el => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(1);
  });
}

test("desktop keeps the quiz grid", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  const grid = page.getByRole("region", { name: "Quizzes", exact: true }).first();
  await expect(grid.locator(".quiz-card").first()).toBeVisible();
  expect(await grid.evaluate(el => getComputedStyle(el).gridAutoFlow)).toBe("row");
  expect(await grid.evaluate(el => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(1);
});

