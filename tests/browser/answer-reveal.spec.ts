import { test, expect, type Page } from "@playwright/test";
import { loadLayoutFixtures } from "./layout-fixture";

async function loadDeck(page: Page, showAnswers = true) {
  await loadLayoutFixtures(page);
  await page.evaluate(async (showAnswers) => {
    const db = await new Promise<IDBDatabase>((resolve) => {
      const request = indexedDB.open("quizcraft-offline", 1);
      request.onsuccess = () => resolve(request.result);
    });
    await new Promise<void>((resolve) => {
      const tx = db.transaction("data", "readwrite");
      const store = tx.objectStore("data");
      const request = store.get("library");
      request.onsuccess = () => {
        const data = request.result;
        const quiz = data.quizzes[0];
        data.quizzes = [quiz];
        quiz.settings.showAnswers = showAnswers;
        const card = {
          explanation: "An explanation that fits the available space.",
          points: 10,
        };
        quiz.questions = [
          {
            ...card,
            id: "multiple",
            type: "multiple",
            prompt: "Choose the planet",
            options: ["Mars", "Moon"],
            accepted: ["Mars"],
          },
          {
            ...card,
            id: "boolean",
            type: "boolean",
            prompt: "Water is a liquid",
            options: ["True", "False"],
            accepted: ["True"],
          },
          {
            ...card,
            id: "several",
            type: "multiple",
            prompt: "Choose two planets",
            options: ["Mars", "Moon", "Earth", "Comet"],
            accepted: ["Mars", "Earth"],
            correctOptions: [0, 2],
          },
          {
            ...card,
            id: "blank",
            type: "blank",
            prompt: "Our star is ___",
            options: [],
            accepted: ["Sun"],
          },
        ];
        quiz.questionCount = quiz.questions.length;
        store.put(data, "library");
      };
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
    });
  }, showAnswers);
  await page.reload();
  await expect(page.locator("#startup-splash")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Layout quiz 1", exact: true })
    .click();
}

async function fits(page: Page) {
  const dialog = page.getByRole("dialog", { name: "Flashcard study mode" });
  await expect(dialog).toBeInViewport({ ratio: 1 });
  expect(
    await dialog.evaluate((el) => el.scrollWidth - el.clientWidth),
  ).toBeLessThanOrEqual(1);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - innerWidth,
    ),
  ).toBeLessThanOrEqual(1);
  for (const name of ["SATISFIED", "Next card", "Reveal answer"]) {
    const button = page.getByRole("button", { name, exact: true });
    // On short screens, keyboard focus must scroll the control fully into view.
    if (name === "Reveal answer") await button.focus();
    await expect(button).toBeInViewport({ ratio: 1 });
    expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  }
}

async function choose(page: Page, name: string) {
  const choice = page.getByRole("button", { name, exact: true });
  await choice.scrollIntoViewIfNeeded();
  await choice.focus();
  await page.evaluate(() => new Promise<void>((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
  ));
  const positions = () => page.locator('.flashcard-front[aria-hidden="false"]')
    .evaluate((front) => [...front.querySelectorAll(
      ".flashcard-text, .flashcard-options, .flashcard-face-footer",
    )].map((element) => {
      const { x, y, width, height } = element.getBoundingClientRect();
      return [x, y, width, height];
    }));
  const before = await positions();
  await choice.click();
  await page.evaluate(() => new Promise<void>((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
  ));
  const after = await positions();
  for (let i = 0; i < before.length; i++) {
    for (let j = 0; j < before[i].length; j++) {
      expect(Math.abs(after[i][j] - before[i][j])).toBeLessThanOrEqual(1);
    }
  }
}

for (const [width, height] of [
  [320, 568],
  [390, 844],
  [568, 320],
  [844, 390],
  [768, 1024],
  [1024, 768],
  [1440, 900],
  [1920, 1080],
]) {
  test(`selected choices show green or red borders without flipping at ${width}x${height}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await loadDeck(page);
    const front = page.locator('.flashcard-front[aria-hidden="false"]');
    const back = page.locator('.flashcard-back[aria-hidden="false"]');
    const next = page.getByRole("button", { name: "Next card", exact: true });
    await choose(page, "B. Moon");
    await expect(
      front.getByRole("button", { name: "B. Moon", exact: true }),
    ).toHaveCSS("border-top-color", "rgb(163, 99, 99)");
    await expect(
      front.getByRole("button", { name: "B. Moon", exact: true }),
    ).toHaveAccessibleDescription("Incorrect answer");
    await expect(
      front.getByRole("button", { name: "A. Mars", exact: true }),
    ).toHaveAttribute("data-answer-state", "correct");
    await expect(front.getByRole("status")).toHaveText("💪 Not quite!");
    await expect(front.locator(".flashcard-option:disabled")).toHaveCount(2);
    await page.getByRole("button", { name: "Start again", exact: true }).click();
    await front.getByRole("button", { name: "A. Mars", exact: true }).click();
    await expect(
      front.getByRole("button", { name: "A. Mars", exact: true }),
    ).toHaveCSS("border-top-color", "rgb(75, 128, 96)");
    await expect(
      front.getByRole("button", { name: "B. Moon", exact: true }),
    ).not.toHaveAttribute("data-answer-state");
    await expect(front.getByRole("status")).toHaveText("🎉 Perfect!");
    await expect(front).toBeVisible();
    await expect(back).toHaveCount(0);
    await fits(page);
    await next.click();
    await front.getByRole("button", { name: "A. True", exact: true }).focus();
    await page.keyboard.press("Space");
    await expect(front.getByRole("status")).toHaveText("🎉 Perfect!");
    await expect(
      front.getByRole("button", { name: "B. False", exact: true }),
    ).not.toHaveAttribute("data-answer-state");
    await expect(
      front.getByRole("button", { name: "A. True", exact: true }),
    ).toHaveCSS("border-top-color", "rgb(75, 128, 96)");
    await expect(front.locator(".flashcard-option:disabled")).toHaveCount(2);
    await page.getByRole("button", { name: "Start again", exact: true }).click();
    await next.click();
    await choose(page, "B. False");
    await expect(
      front.getByRole("button", { name: "B. False", exact: true }),
    ).toHaveCSS("border-top-color", "rgb(163, 99, 99)");
    await expect(
      front.getByRole("button", { name: "A. True", exact: true }),
    ).toHaveAttribute("data-answer-state", "correct");
    await expect(front).toBeVisible();
    await expect(back).toHaveCount(0);
    await fits(page);
    await next.click();
    await front.getByRole("button", { name: "A. Mars", exact: true }).click();
    await expect(front).toBeVisible();
    await expect(back).toHaveCount(0);
    await expect(front.locator(".flashcard-choice-feedback")).toBeEmpty();
    await expect(
      front.getByRole("button", { name: "C. Earth", exact: true }),
    ).not.toHaveAttribute("data-answer-state");
    await choose(page, "B. Moon");
    await expect(
      front.getByRole("button", { name: "A. Mars", exact: true }),
    ).toHaveCSS("border-top-color", "rgb(75, 128, 96)");
    await expect(
      front.getByRole("button", { name: "B. Moon", exact: true }),
    ).toHaveCSS("border-top-color", "rgb(163, 99, 99)");
    await expect(
      front.getByRole("button", { name: "C. Earth", exact: true }),
    ).toHaveCSS("border-top-color", "rgb(75, 128, 96)");
    await expect(
      front.getByRole("button", { name: "C. Earth", exact: true }),
    ).toHaveAccessibleDescription("Correct answer");
    await expect(
      front.getByRole("button", { name: "C. Earth", exact: true }),
    ).toHaveAttribute("aria-pressed", "false");
    await expect(front.getByRole("status")).toHaveText("🙂 Almost!");
    await expect(
      front.getByRole("button", { name: "D. Comet", exact: true }),
    ).toHaveAttribute("data-answer-state", "incorrect");
    await expect(
      front.getByRole("button", { name: "D. Comet", exact: true }),
    ).toHaveAttribute("aria-pressed", "false");
    await expect(
      front.getByRole("button", { name: "D. Comet", exact: true }),
    ).toHaveAccessibleDescription("Incorrect answer");
    await expect(front.getByRole("status")).toBeInViewport({ ratio: 1 });
    await page.screenshot({
      path: `test-results/almost-feedback-${width}x${height}.png`,
      animations: "disabled",
    });
    await expect(front.locator(".flashcard-option:disabled")).toHaveCount(4);
    await page.getByRole("button", { name: "Start again", exact: true }).click();
    await next.click();
    await next.click();
    await choose(page, "A. Mars");
    await choose(page, "C. Earth");
    await expect(
      front.getByRole("button", { name: "C. Earth", exact: true }),
    ).toHaveCSS("border-top-color", "rgb(75, 128, 96)");
    await expect(front.getByRole("status")).toHaveText("🎉 Perfect!");
    await expect(
      front.getByRole("button", { name: "B. Moon", exact: true }),
    ).not.toHaveAttribute("data-answer-state");
    await expect(
      front.getByRole("button", { name: "D. Comet", exact: true }),
    ).not.toHaveAttribute("data-answer-state");
    await expect(front).toBeVisible();
    await expect(back).toHaveCount(0);
    await fits(page);
    await next.click();
    await front
      .getByRole("textbox", { name: "Your answer", exact: true })
      .fill("Sun");
    await expect(front).toBeVisible();
    await expect(back).toHaveCount(0);
    await front
      .getByRole("button", { name: "Reveal answer", exact: true })
      .click();
    await expect(back.locator(".flashcard-text")).toHaveText("Sun");
    await expect(
      page.getByRole("button", { name: "SATISFIED", exact: true }),
    ).toBeInViewport({ ratio: 1 });
    await page.screenshot({
      path: `test-results/choice-feedback-${width}x${height}.png`,
      animations: "disabled",
    });
  });
}

test("disabled answer reveal stays disabled after selecting choices", async ({
  page,
}) => {
  await loadDeck(page, false);
  const front = page.locator('.flashcard-front[aria-hidden="false"]');
  await front.getByRole("button", { name: "A. Mars", exact: true }).click();
  await expect(front).toBeVisible();
  await expect(
    front.getByRole("button", { name: "A. Mars", exact: true }),
  ).toHaveCSS("border-top-color", "rgb(75, 128, 96)");
  await expect(
    page.getByRole("button", { name: "Answer reveal is off", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Next card", exact: true }).click();
  await front.getByRole("button", { name: "A. True", exact: true }).click();
  await expect(front).toBeVisible();
  await expect(
    page.locator('.flashcard-back[aria-hidden="false"]'),
  ).toHaveCount(0);
});

test("rotating a phone and reloading retain selected-choice feedback without flipping", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await loadDeck(page);
  await page.getByRole("button", { name: "A. Mars", exact: true }).click();
  await page.setViewportSize({ width: 844, height: 390 });
  await expect(
    page.locator('.flashcard-front[aria-hidden="false"]'),
  ).toBeVisible();
  await fits(page);
  await page.reload();
  await expect(
    page.getByRole("button", { name: "A. Mars", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    page.getByRole("button", { name: "A. Mars", exact: true }),
  ).toHaveCSS("border-top-color", "rgb(75, 128, 96)");
});

test("dark mode keeps correct and incorrect choice borders distinct", async ({
  page,
}) => {
  await loadDeck(page);
  await page.evaluate(() => document.documentElement.classList.add("dark"));
  const wrong = page.getByRole("button", { name: "B. Moon", exact: true });
  const correct = page.getByRole("button", { name: "A. Mars", exact: true });
  await wrong.click();
  await expect(wrong).toHaveCSS("border-top-color", "rgb(176, 119, 119)");
  await page.getByRole("button", { name: "Start again", exact: true }).click();
  await correct.click();
  await expect(correct).toHaveCSS("border-top-color", "rgb(98, 139, 112)");
  await expect(
    page.locator('.flashcard-front[aria-hidden="false"]'),
  ).toBeVisible();
});

for (const correct of [false, true]) {
test(`${correct ? "correct" : "incorrect"} completed answers stay locked for feedback and clear on an unsatisfied retry`, async ({ page }) => {
  await loadDeck(page);
  const front = page.locator('.flashcard-front[aria-hidden="false"]');
  const selected = correct ? "A. Mars" : "B. Moon";
  const other = correct ? "B. Moon" : "A. Mars";
  await front.getByRole("button", { name: selected, exact: true }).click();
  await expect(front.locator(".flashcard-option:disabled")).toHaveCount(2);
  await front.getByRole("button", { name: other, exact: true })
    .evaluate((button: HTMLButtonElement) => button.click());
  await expect(front.getByRole("button", { name: selected, exact: true }))
    .toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "BAD", exact: true }).click();
  await page.getByRole("button", { name: "Next card", exact: true }).click();
  await front.getByRole("button", { name: "A. True", exact: true }).click();
  await page.getByRole("button", { name: "SATISFIED", exact: true }).click();
  await page.getByRole("button", { name: "Next card", exact: true }).click();
  await front.getByRole("button", { name: "A. Mars", exact: true }).click();
  await front.getByRole("button", { name: "C. Earth", exact: true }).click();
  await page.getByRole("button", { name: "SATISFIED", exact: true }).click();
  await page.getByRole("button", { name: "Next card", exact: true }).click();
  await front.getByRole("textbox", { name: "Your answer", exact: true }).fill("Sun");
  await page.getByRole("button", { name: "SATISFIED", exact: true }).click();
  await page.getByRole("button", { name: "Review remaining", exact: true }).click();
  await expect(front).toContainText("Choose the planet");
  await expect(front.locator(".flashcard-option:disabled")).toHaveCount(0);
  await expect(front.getByRole("button", { name: selected, exact: true }))
    .toHaveAttribute("aria-pressed", "false");
  await page.reload();
  await expect(front.locator(".flashcard-option:disabled")).toHaveCount(0);
  await page.getByRole("button", { name: "Start again", exact: true }).click();
  await expect(front.locator(".flashcard-option:disabled")).toHaveCount(0);
  await expect(front.locator('.flashcard-option[aria-pressed="true"]')).toHaveCount(0);
  await expect(front.locator('.flashcard-option[data-answer-state]')).toHaveCount(0);
});
}

for (const reducedMotion of ["no-preference", "reduce"] as const) {
  test(`correct answers celebrate without moving the card with motion preference ${reducedMotion}`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ reducedMotion });
    await loadDeck(page);
    const front = page.locator('.flashcard-front[aria-hidden="false"]');
    const burst = page.locator(".flashcard-celebration");
    await expect(front).toBeVisible();
    const before = await front.locator(".flashcard-options").boundingBox();
    await front.getByRole("button", { name: "A. Mars", exact: true }).click();
    await expect(front.getByRole("status")).toHaveText("🎉 Perfect!");
    await expect(burst).toHaveCount(reducedMotion === "reduce" ? 0 : 1);
    if (reducedMotion === "no-preference") {
      await expect(burst).toHaveCSS("pointer-events", "none");
      await expect(burst.locator(".flashcard-confetti")).toHaveCount(20);
      expect(await front.locator(".flashcard-options").boundingBox()).toEqual(before);
      await burst.evaluate((element) => element.getAnimations({ subtree: true })
        .forEach((animation) => { animation.pause(); animation.currentTime = 300; }));
      await page.screenshot({ path: "test-results/correct-answer-celebration.png" });
    }
    await expect(burst).toHaveCount(0, { timeout: 2000 });
    await page.getByRole("button", { name: "Next card", exact: true }).click();
    await front.getByRole("button", { name: "A. True", exact: true }).click();
    await expect(burst).toHaveCount(reducedMotion === "reduce" ? 0 : 1);
    await page.getByRole("button", { name: "Next card", exact: true }).click();
    await expect(burst).toHaveCount(0);
    await front.getByRole("button", { name: "A. Mars", exact: true }).click();
    await expect(burst).toHaveCount(0);
    await front.getByRole("button", { name: "C. Earth", exact: true }).click();
    await expect(burst).toHaveCount(reducedMotion === "reduce" ? 0 : 1);
    await page.getByRole("button", { name: "Start again", exact: true }).click();
    await expect(burst).toHaveCount(0);
    await front.getByRole("button", { name: "B. Moon", exact: true }).click();
    await expect(burst).toHaveCount(0);
  });

  test(`incorrect answers shake briefly with motion preference ${reducedMotion}`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion });
    await loadDeck(page);
    await expect(page.locator('.flashcard-front[aria-hidden="false"]'))
      .toBeVisible();
    const answer = (label: string) => page.evaluate((label) => {
      const front = document.querySelector('.flashcard-front[aria-hidden="false"]')!;
      const button = [...front.querySelectorAll<HTMLButtonElement>(".flashcard-option")]
        .find((option) => option.getAttribute("aria-label") === label)!;
      button.click();
      return front.querySelector(".flashcard-options")!.getAnimations()
        .filter((animation) => animation.id === "incorrect-answer-shake")
        .map((animation) => ({
          duration: animation.effect!.getTiming().duration,
          frames: (animation.effect as KeyframeEffect).getKeyframes()
            .map((frame) => frame.transform),
        }));
    }, label);
    const shake = await answer("B. Moon");
    expect(shake).toHaveLength(reducedMotion === "reduce" ? 0 : 1);
    if (shake.length) {
      expect(shake[0].duration).toBe(280);
      expect(shake[0].frames).toEqual([
        "translateX(0px)", "translateX(-3px)", "translateX(3px)",
        "translateX(-2px)", "translateX(2px)", "translateX(0px)",
      ]);
    }
    await page.evaluate(async () => {
      await Promise.all(document.getAnimations().map((animation) => animation.finished.catch(() => {})));
    });
    // Clicking a revealed choice cannot change the response or replay the shake.
    expect(await answer("A. Mars")).toEqual([]);
    await expect(page.getByRole("button", { name: "B. Moon", exact: true }))
      .toHaveAttribute("aria-pressed", "true");
    await page.getByRole("button", { name: "Next card", exact: true }).click();
    await page.getByRole("button", { name: "Next card", exact: true }).click();
    await expect(page.locator('.flashcard-front[aria-hidden="false"] .flashcard-text'))
      .toHaveText("Choose two planets");
    expect(await answer("A. Mars")).toEqual([]);
    expect(await answer("B. Moon"))
      .toHaveLength(reducedMotion === "reduce" ? 0 : 1);
    await page.evaluate(async () => {
      await Promise.all(document.getAnimations().map((animation) =>
        animation.finished.catch(() => {}),
      ));
    });
    await expect(page.locator('.flashcard-front[aria-hidden="false"] .flashcard-options'))
      .toHaveCSS("transform", "none");
    expect(await answer("B. Moon")).toEqual([]);
    expect(await answer("C. Earth")).toEqual([]);
    await expect(page.locator('.flashcard-front[aria-hidden="false"] [role="status"]'))
      .toHaveText("🙂 Almost!");
  });
}
