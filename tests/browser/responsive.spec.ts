import { test, expect, type Page } from "@playwright/test";

async function navigate(page: Page, name: string) {
  const menu = page.getByRole("button", {
    name: "Open navigation",
    exact: true,
  });
  if (await menu.isVisible()) await menu.click();
  await page
    .locator("#quizcraft-navigation")
    .getByRole("button", { name, exact: true })
    .click();
}
async function fits(page: Page) {
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.scrollWidth - innerWidth),
    )
    .toBeLessThanOrEqual(1);
}

for (const width of [320, 390, 768, 1024]) {
  test.describe(`responsive workflow at ${width}px`, () => {
    test.use({
      viewport: { width, height: width >= 768 ? 1024 : 844 },
      hasTouch: true,
      isMobile: width <= 760,
    });
    test("touch controls, long content, editor, flashcards and quiz taking fit", async ({
      page,
    }) => {
      if (width === 390)
        await page.addInitScript(() =>
          localStorage.setItem("quizcraft-theme", "dark"),
        );
      await page.goto("/", { waitUntil: "domcontentloaded" });
      await expect(
        page.getByRole("heading", {
          name: "Create. Share. Challenge Yourself.",
        }),
      ).toBeVisible();
      await fits(page);
      await page.getByRole("button", { name: "Log in", exact: true }).tap();
      await expect(page.getByRole("dialog")).toBeVisible();
      const email = page.getByLabel("Email address");
      expect(
        await email.evaluate((el) => parseFloat(getComputedStyle(el).fontSize)),
      ).toBeGreaterThanOrEqual(16);
      await fits(page);
      await page.getByRole("button", { name: "Close", exact: true }).tap();
      const registration = await page.request.post("/api/auth/register", {
        data: {
          email: `responsive-${width}-${Date.now()}@example.test`,
          name: "Mobile learner",
          password: "responsive-password",
        },
      });
      expect(registration.ok()).toBe(true);
      const { id } = await (
        await page.request.post("/api/quizzes", { data: {} })
      ).json();
      const draft = await (await page.request.get("/api/quizzes/" + id)).json();
      const title = "QuizCraftStudy".repeat(10);
      const answer =
        "Plants use photosynthesis to convert sunlight, carbon dioxide, and water into sugars that support their growth.";
      const saved = await page.request.put("/api/quizzes/" + id, {
        data: {
          ...draft,
          title,
          description:
            "A study deck with long questions and answers that should stay readable on a phone.",
          settings: { ...draft.settings, time: 1 },
          questions: [
            {
              type: "multiple",
              prompt:
                "Which option describes how plants turn sunlight into usable energy? Read all the options before choosing your answer.",
              options: [
                answer,
                "Plants take usable energy directly from rocks and never need sunlight or water.",
                "Plants only absorb nutrients through their leaves and do not perform photosynthesis.",
                "Plants turn oxygen directly into sunlight through a process called respiration.",
              ],
              accepted: [answer],
              correctOption: 0,
              explanation:
                "Photosynthesis supports plant growth and produces oxygen. ".repeat(
                  60,
                ),
              points: 10,
            },
            {
              type: "blank",
              prompt: "Name the capital city of Japan.",
              options: [],
              accepted: ["Tokyo"],
              explanation: "Tokyo is the capital of Japan.",
              points: 10,
            },
          ],
        },
      });
      expect(saved.ok()).toBe(true);
      await page.reload({ waitUntil: "domcontentloaded" });
      await expect(
        page.getByRole("button", { name: "Open profile", exact: true }),
      ).toBeVisible();
      await navigate(page, "My quizzes");
      await expect(
        page.getByRole("heading", { name: "Made by you", exact: true }),
      ).toBeVisible();
      await fits(page);
      const study = page.getByRole("button", {
        name: "Flashcards",
        exact: true,
      });
      expect((await study.boundingBox())!.height).toBeGreaterThanOrEqual(44);
      await study.tap();
      await expect(
        page.getByText("Card 1 of 2", { exact: true }),
      ).toBeVisible();
      await fits(page);
      const card = page.locator(".flashcard");
      if (width <= 760) {
        await page
          .getByRole("button", { name: "Back to my quizzes", exact: true })
          .tap();
        await expect(
          page.getByRole("heading", { name: "Made by you", exact: true }),
        ).toBeVisible();
        await study.tap();
        await expect(card).toBeVisible();
      }
      if (width <= 760) {
        await expect(page.locator("#root")).toHaveAttribute(
          "aria-hidden",
          "true",
        );
        await expect(card).toBeInViewport({ ratio: 1 });
        await expect(
          page.getByRole("button", { name: "Next card", exact: true }),
        ).toBeInViewport({ ratio: 1 });
        expect(
          await page.evaluate(
            () => document.documentElement.scrollHeight - innerHeight,
          ),
        ).toBeLessThanOrEqual(1);
        await page.setViewportSize({ width, height: 390 });
        await expect(card).toBeInViewport({ ratio: 1 });
        await expect(
          page.getByRole("button", { name: "Back to my quizzes", exact: true }),
        ).toBeInViewport({ ratio: 1 });
        expect((await card.boundingBox())!.height).toBeGreaterThan(100);
        await page.setViewportSize({ width, height: 844 });
      }
      await card.tap();
      await expect(card).toHaveAttribute("aria-pressed", "true");
      const back = page.locator('.flashcard-back[aria-hidden="false"]');
      await expect(back).toContainText(answer);
      expect(await back.evaluate((el) => el.scrollTop)).toBe(0);
      await fits(page);
      await page.screenshot({
        path: `test-results/flashcards-responsive-${width}.png`,
        fullPage: true,
        animations: "disabled",
      });
      // Long answers still scroll vertically without flipping the card.
      await card.scrollIntoViewIfNeeded();
      const scrollClient = await page.context().newCDPSession(page);
      const scrollRect = (await card.boundingBox())!;
      const scrollX = scrollRect.x + scrollRect.width / 2;
      const scrollY = scrollRect.y + scrollRect.height * 0.8;
      await scrollClient.send("Input.dispatchTouchEvent", {
        type: "touchStart",
        touchPoints: [{ x: scrollX, y: scrollY }],
      });
      for (const distance of [30, 70, 110, 150]) {
        await page.waitForTimeout(50);
        await scrollClient.send("Input.dispatchTouchEvent", {
          type: "touchMove",
          touchPoints: [{ x: scrollX, y: scrollY - distance }],
        });
      }
      await scrollClient.send("Input.dispatchTouchEvent", {
        type: "touchEnd",
        touchPoints: [],
      });
      await expect
        .poll(() => back.evaluate((el) => el.scrollTop))
        .toBeGreaterThan(0);
      await expect(card).toHaveAttribute("aria-pressed", "true");
      await scrollClient.detach();
      // Wait for native scroll momentum before tapping another control.
      let lastScroll = -1,
        stableScroll = 0;
      await expect
        .poll(
          async () => {
            const current = await back.evaluate((el) => el.scrollTop);
            stableScroll = current === lastScroll ? stableScroll + 1 : 0;
            lastScroll = current;
            return stableScroll;
          },
          { intervals: [100] },
        )
        .toBeGreaterThanOrEqual(3);
      await page.getByRole("button", { name: "Next card", exact: true }).tap();
      await expect(
        page.getByText("Card 2 of 2", { exact: true }),
      ).toBeVisible();
      // Dispatch real touch events to verify the horizontal swipe on a phone.
      await card.scrollIntoViewIfNeeded();
      const client = await page.context().newCDPSession(page);
      const rect = (await card.boundingBox())!;
      const y = Math.max(1, Math.min(rect.y + 80, 800));
      await client.send("Input.dispatchTouchEvent", {
        type: "touchStart",
        touchPoints: [{ x: rect.x + rect.width * 0.2, y }],
      });
      await client.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [{ x: rect.x + rect.width * 0.8, y }],
      });
      await client.send("Input.dispatchTouchEvent", {
        type: "touchEnd",
        touchPoints: [],
      });
      await expect(
        page.getByText("Card 1 of 2", { exact: true }),
      ).toBeVisible();
      await expect(card).toHaveAttribute("aria-pressed", "false");
      // A left swipe advances, including after revealing an answer.
      await card.press("Enter");
      await expect(card).toHaveAttribute("aria-pressed", "true");
      await card.evaluate((el) =>
        Promise.all(
          el
            .getAnimations({ subtree: true })
            .map((animation) => animation.finished),
        ),
      );
      await client.send("Input.dispatchTouchEvent", {
        type: "touchStart",
        touchPoints: [{ x: rect.x + rect.width * 0.8, y }],
      });
      await client.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [{ x: rect.x + rect.width * 0.2, y }],
      });
      await client.send("Input.dispatchTouchEvent", {
        type: "touchEnd",
        touchPoints: [],
      });
      await expect(
        page.getByText("Card 2 of 2", { exact: true }),
      ).toBeVisible();
      await expect(card).toHaveAttribute("aria-pressed", "false");
      await client.detach();
      expect(
        (await (await page.request.get("/api/library")).json()).attempts,
      ).toHaveLength(0);
      await page
        .getByRole("button", { name: "Back to my quizzes", exact: true })
        .click();
      await expect(
        page.getByRole("heading", { name: "Made by you", exact: true }),
      ).toBeVisible();
      await page
        .getByRole("button", { name: "Edit quiz", exact: true })
        .click();
      await expect(
        page.getByRole("textbox", { name: "Quiz title", exact: true }),
      ).toHaveValue(title);
      await fits(page);
      expect(
        (await page.locator(".correct-option-toggle").first().boundingBox())!
          .height,
      ).toBeGreaterThanOrEqual(44);
      await page
        .getByRole("radio", { name: "Mark option 1 correct", exact: true })
        .check();
      await page
        .getByRole("button", { name: "Save draft", exact: true })
        .click();
      await expect(
        page.getByRole("heading", { name: "Made by you", exact: true }),
      ).toBeVisible();
      await page.locator(".quiz-card .card-title").click();
      await page.getByRole("button", { name: /get started/ }).click();
      await expect(
        page.getByRole("heading", { name: /Which option describes/ }),
      ).toBeVisible();
      await fits(page);
      await page
        .locator(".answer-options > button")
        .last()
        .scrollIntoViewIfNeeded();
      if (width <= 760) await expect(page.locator(".timer")).toBeInViewport();
      await page.locator(".answer-options > button").first().click();
      await page
        .getByRole("button", { name: "Next question", exact: true })
        .click();
      await page
        .getByRole("textbox", { name: "Your answer", exact: true })
        .fill("Tokyo");
      await page
        .getByRole("button", { name: "Review answers", exact: true })
        .click();
      await fits(page);
      await page
        .getByRole("button", { name: "Submit quiz", exact: true })
        .click();
      await expect(
        page.getByRole("heading", { name: "Nicely done!", exact: true }),
      ).toBeVisible();
      await fits(page);
      await navigate(page, "My dashboard");
      await expect(
        page.getByRole("heading", {
          name: "A little progress, every day",
          exact: true,
        }),
      ).toBeVisible();
      await fits(page);
    });
  });
}
