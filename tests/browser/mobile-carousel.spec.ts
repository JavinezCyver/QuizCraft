import { test, expect } from "@playwright/test";
import { loadLayoutFixtures } from "./layout-fixture";

test.describe("phone launch screen", () => {
  test.use({ hasTouch: true, viewport: { width: 390, height: 844 } });

  test("shows the app logo before startup, opens the app, and works offline without replaying during navigation", async ({
    page,
  }) => {
    let releaseScripts!: () => void;
    const scriptsReady = new Promise<void>((resolve) => {
      releaseScripts = resolve;
    });
    await page.route("**/assets/*.js", async (route) => {
      await scriptsReady;
      await route.continue();
    });
    await page.goto("/", { waitUntil: "commit" });
    const splash = page.getByRole("status", {
      name: "Opening QuizCraft",
      exact: true,
    });
    await expect(splash).toBeVisible();
    const logo = splash.getByRole("img", {
      name: "QuizCraft logo",
      exact: true,
    });
    await expect
      .poll(() =>
        logo.evaluate((image: HTMLImageElement) => image.naturalWidth),
      )
      .toBeGreaterThan(0);
    for (const [width, height] of [
      [320, 568],
      [390, 844],
      [844, 390],
    ]) {
      await page.setViewportSize({ width, height });
      await expect(logo).toBeInViewport({ ratio: 1 });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth - innerWidth,
        ),
      ).toBeLessThanOrEqual(1);
    }
    await page.setViewportSize({ width: 390, height: 844 });
    releaseScripts();
    await expect(page.locator("#root")).toHaveAttribute("inert", "");
    await expect(splash).toHaveCount(0);
    await expect(page.locator("#root")).not.toHaveAttribute("aria-hidden");
    await expect(
      page.getByRole("heading", {
        name: "Your library starts here",
        exact: true,
      }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Open navigation", exact: true })
      .click();
    await page.getByRole("button", { name: "My quizzes", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Made by you", exact: true }),
    ).toBeVisible();
    await expect(page.locator("#startup-splash")).toHaveCount(0);
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
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(splash).toBeVisible();
    await expect
      .poll(() =>
        logo.evaluate((image: HTMLImageElement) => image.naturalWidth),
      )
      .toBeGreaterThan(0);
    await expect(splash).toHaveCount(0);
    await expect(
      page.getByRole("heading", {
        name: "Your library starts here",
        exact: true,
      }),
    ).toBeVisible();
  });

  test("reduced motion is respected and startup errors still open the app", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.addInitScript(() => {
      indexedDB.open = () => {
        throw new Error("Storage unavailable for startup test");
      };
    });
    await page.goto("/", { waitUntil: "domcontentloaded" });
    const splash = page.getByRole("status", {
      name: "Opening QuizCraft",
      exact: true,
    });
    await expect(splash).toBeVisible();
    await expect(splash).toHaveCSS("transition-duration", "0s");
    await expect(splash).toHaveCount(0);
    await expect(
      page.getByText("Storage unavailable for startup test", { exact: true }),
    ).toBeVisible();
    await expect(page.locator("#root")).not.toHaveAttribute("inert");
  });
});

test("desktop startup opens directly without the phone splash", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await expect(
    page.getByRole("heading", {
      name: "Your library starts here",
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.locator("#startup-splash")).toHaveCount(0);
  await expect(page.locator("#root")).not.toHaveAttribute("inert");
});

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
