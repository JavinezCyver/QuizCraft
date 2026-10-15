import { test, expect, type Page } from "@playwright/test";
import { loadLayoutFixtures } from "./layout-fixture";

async function loadStudy(page: Page) {
  await loadLayoutFixtures(page);
  await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve) => {
      const request = indexedDB.open("quizcraft-offline", 1);
      request.onsuccess = () => resolve(request.result);
    });
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction("data", "readwrite");
      const store = transaction.objectStore("data");
      const request = store.get("library");
      request.onsuccess = () => {
        const data = request.result;
        const quiz = data.quizzes[0];
        quiz.title =
          "A long flashcard deck title for studying across phones, tablets, and desktops";
        quiz.category = "StudyCategory".repeat(12);
        quiz.settings.time = 10;
        quiz.questionCount = 3;
        quiz.questions = [
          {
            id: "multiple",
            type: "multiple",
            prompt: "A long question: " + "LongQuestion".repeat(20),
            options: Array.from(
              { length: 8 },
              (_, i) => `Choice ${i + 1}: ` + "LongOption".repeat(18),
            ),
            accepted: ["Choice 1: " + "LongOption".repeat(18)],
            explanation: "A helpful explanation. ".repeat(30),
            points: 10,
          },
          {
            id: "boolean",
            type: "boolean",
            prompt: "A statement to review.",
            options: ["True", "False"],
            accepted: ["True"],
            explanation: "A helpful explanation.",
            points: 10,
          },
          {
            id: "blank",
            type: "blank",
            prompt: "The answer is ___",
            options: [],
            accepted: ["Bruce Wayne"],
            explanation: "Hidden for fill in the blank.",
            points: 10,
          },
        ];
        store.put(data, "library");
      };
      transaction.oncomplete = () => {
        db.close();
        resolve();
      };
      transaction.onerror = () => reject(transaction.error);
    });
  });
  await page.reload();
  await expect(page.locator("#startup-splash")).toHaveCount(0);
}
async function noHorizontalOverflow(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - innerWidth,
    ),
  ).toBeLessThanOrEqual(1);
  const dialog = page.getByRole("dialog", { name: "Flashcard study mode" });
  expect(
    await dialog.evaluate(
      (element) => element.scrollWidth - element.clientWidth,
    ),
  ).toBeLessThanOrEqual(1);
}

for (const [width, height] of [
  [320, 568],
  [390, 844],
  [768, 1024],
  [1024, 768],
  [1440, 900],
  [844, 390],
  [568, 320],
  [390, 420],
]) {
  test(`flashcard study and controls fit ${width}x${height}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height });
    await loadStudy(page);
    await page.locator(".quiz-card .card-title").first().click();
    const dialog = page.getByRole("dialog", { name: "Flashcard study mode" });
    await expect(dialog).toBeInViewport({ ratio: 1 });
    await noHorizontalOverflow(page);
    if (width > height)
      await expect(
        page.getByRole("button", { name: "Next card", exact: true }),
      ).toBeInViewport({ ratio: 1 });
    const front = page.locator('.flashcard-front[aria-hidden="false"]');
    await front.getByRole("button").filter({ hasText: /^A\./ }).click();
    const reveal = page.getByRole("button", {
      name: "Reveal answer",
      exact: true,
    });
    await reveal.click();
    await expect(
      page.locator('.flashcard-back[aria-hidden="false"]'),
    ).toContainText("Choice 1");
    const bad = page.getByRole("button", { name: "BAD", exact: true });
    await bad.click();
    expect((await bad.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    if (width === 320 || (width === 568 && height === 320) || width === 1440) {
      await page.screenshot({
        path: `test-results/flashcard-responsive-${width}x${height}.png`,
        animations: "disabled",
      });
    }
    await page.getByRole("button", { name: "SATISFIED", exact: true }).click();
    await page.getByRole("button", { name: "Next card", exact: true }).click();
    await expect(front).toContainText("A statement to review.");
    await page.getByRole("button", { name: "Next card", exact: true }).click();
    await front
      .getByRole("textbox", { name: "Your answer", exact: true })
      .fill("bruce");
    await reveal.click();
    const back = page.locator('.flashcard-back[aria-hidden="false"]');
    await expect(back.locator("mark")).toHaveText(["bruce", "Bruce"]);
    await expect(back.locator(".flashcard-explanation")).toHaveCount(0);
    await noHorizontalOverflow(page);
    const filter = page.getByRole("combobox", {
      name: "Flashcard rating filter",
      exact: true,
    });
    await filter.click();
    await expect(page.getByRole("listbox")).toBeInViewport({ ratio: 1 });
    const triggerBounds = (await filter.boundingBox())!;
    const menuBounds = (await page.getByRole("listbox").boundingBox())!;
    expect(Math.abs(triggerBounds.width - menuBounds.width)).toBeLessThan(1);
    await page.getByRole("option").filter({ hasText: "SATISFIED" }).click();
    await expect(front).toContainText("A long question:");
    await noHorizontalOverflow(page);
  });
}

for (const width of [320, 768, 1440]) {
  test(`library and editor fit long content at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 844 });
    await loadStudy(page);
    const navigation = page.getByRole("button", {
      name: "Open navigation",
      exact: true,
    });
    if (await navigation.isVisible()) await navigation.click();
    await page.getByRole("button", { name: "My quizzes", exact: true }).click();
    const category = page.getByRole("combobox", {
      name: "Flashcard category",
      exact: true,
    });
    await category.click();
    await expect(page.getByRole("listbox")).toBeInViewport({ ratio: 1 });
    await page.keyboard.press("Escape");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth - innerWidth,
      ),
    ).toBeLessThanOrEqual(1);
    await page
      .getByRole("button", { name: "Edit quiz", exact: true })
      .first()
      .click();
    await expect(
      page.getByRole("heading", { name: /Flashcard creation studio/ }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth - innerWidth,
      ),
    ).toBeLessThanOrEqual(1);
    await page
      .getByRole("combobox", { name: "Question type", exact: true })
      .click();
    await expect(page.getByRole("listbox")).toBeInViewport({ ratio: 1 });
    await page
      .getByRole("option", { name: "Fill in the blank", exact: true })
      .click();
    await expect(
      page.getByLabel("Answer explanation", { exact: true }),
    ).toHaveCount(0);
    await page.getByRole("button", { name: /Flashcard settings/ }).click();
    await expect(
      page.getByRole("switch", { name: /Reveal answers/ }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth - innerWidth,
      ),
    ).toBeLessThanOrEqual(1);
  });
}
