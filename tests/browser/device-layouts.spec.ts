import { test, expect, type Page } from "@playwright/test";

async function fits(page: Page) {
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.scrollWidth - innerWidth),
    )
    .toBeLessThanOrEqual(1);
}
async function navigate(page: Page, name: string) {
  const menu = page.getByRole("button", {
    name: "Open navigation",
    exact: true,
  });
  if (await menu.isVisible()) await menu.click();
  await page
    .locator("#quizcraft-navigation")
    .getByRole("button", { name: new RegExp("^" + name) })
    .click();
}
for (const [width, height] of [
  [320, 568],
  [568, 320],
  [812, 375],
  [768, 1024],
  [1024, 768],
  [1440, 900],
]) {
  test(`secondary screens and long content fit ${width}x${height}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height });
    await page.addInitScript(() =>
      localStorage.setItem("quizcraft-theme", "dark"),
    );
    const name = "MedicalLearner".repeat(5),
      title = "PharmacologyReview".repeat(7),
      category = "ClinicalPharmacology".repeat(3);
    const user = await (
      await page.request.post("/api/auth/register", {
        data: {
          email: `devices-${width}-${Date.now()}@example.test`,
          name,
          password: "responsive-password",
        },
      })
    ).json();
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
            category,
            status: "published",
            settings: { ...draft.settings, layout: "all" },
            questions: [1, 2, 3].map((n) => ({
              type: "blank",
              prompt: `${n}. ${title}`,
              options: [],
              accepted: ["Answer"],
              points: 10,
            })),
          },
        })
      ).ok(),
    ).toBe(true);
    const attempt = await (
      await page.request.post(`/api/quizzes/${id}/start`, {
        data: { name, public: true },
      })
    ).json();
    await page.request.post(`/api/attempts/${attempt.id}/submit`, {
      data: {
        answers: Object.fromEntries(
          attempt.questions.map((q: { id: string }) => [q.id, "Answer"]),
        ),
      },
    });
    await page.request.post(`/api/bookmarks/${id}`, { data: { saved: true } });
    await page.goto("/");
    await expect(
      page.getByRole("button", { name: "Open profile", exact: true }),
    ).toBeVisible();
    await fits(page);
    for (const section of [
      "My dashboard",
      "Quiz history",
      "Saved quizzes",
      "Achievements",
      "My quizzes",
    ]) {
      await navigate(page, section);
      await fits(page);
      if (["My dashboard", "Quiz history", "Saved quizzes"].includes(section)) {
        await expect(
          page.getByRole("button", { name: /^Create a quiz$/i }),
        ).toHaveCount(0);
      }
    }
    await page
      .getByRole("button", { name: "Open profile", exact: true })
      .click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeInViewport({ ratio: 1 });
    await page
      .getByRole("button", { name: "Save profile", exact: true })
      .scrollIntoViewIfNeeded();
    await expect(
      page.getByRole("button", { name: "Save profile", exact: true }),
    ).toBeInViewport();
    await expect(
      page.getByRole("button", { name: "Close", exact: true }),
    ).toBeInViewport();
    await fits(page);
    await page.keyboard.press("Escape");
    await page.goto(`/?quiz=${id}`);
    await expect(page.locator(".leader-row")).toContainText(name);
    await fits(page);
    await page.getByRole("button", { name: /get started/ }).click();
    await expect(
      page.getByRole("textbox", { name: "Your answer", exact: true }),
    ).toHaveCount(3);
    await fits(page);
    await page.route("**/api/me", (route) =>
      route.fulfill({ json: { ...user, admin: true } }),
    );
    await page.route("**/api/admin", (route) =>
      route.fulfill({
        json: {
          users: 10,
          quizzes: 12,
          attempts: 40,
          reports: [
            {
              id: "layout-report",
              title,
              reason: title.repeat(3),
              status: "open",
            },
          ],
        },
      }),
    );
    await page.goto("/");
    await expect(
      page.getByRole("button", { name: "Open profile", exact: true }),
    ).toBeVisible();
    await navigate(page, "Administration");
    await expect(
      page.getByRole("heading", { name: "Administration", exact: true }),
    ).toBeVisible();
    await fits(page);
    await page.screenshot({
      path: `test-results/device-layout-${width}x${height}.png`,
      fullPage: true,
      animations: "disabled",
    });
  });
}
