import { test, expect, type Page } from "@playwright/test";
import { loadLayoutFixtures } from "./layout-fixture";
import { openSettings } from "./navigation";

async function stored(page: Page) {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve) => {
      const request = indexedDB.open("quizcraft-offline", 1);
      request.onsuccess = () => resolve(request.result);
    });
    return new Promise<any>((resolve) => {
      const request = db.transaction("data").objectStore("data").get("library");
      request.onsuccess = () => {
        db.close();
        resolve(request.result);
      };
    });
  });
}

for (const [width, height] of [
  [320, 568],
  [390, 844],
]) {
  test(`a two-question photo deck shows each question once without More at ${width}x${height}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height });
    await loadLayoutFixtures(page);
    await page.evaluate(async () => {
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
          const canvas = document.createElement("canvas");
          canvas.width = 640;
          canvas.height = 335;
          quiz.questions = [
            {
              ...quiz.questions[0],
              type: "multiple",
              prompt: "**One question with one photo and four answer choices**",
              options: [
                "First answer",
                "Second answer",
                "Third answer",
                "Fourth answer",
              ],
              accepted: ["First answer"],
              questionImage: canvas.toDataURL(),
            },
            {
              ...quiz.questions[0],
              id: "second-question",
              prompt: "Second question",
              questionImage: "",
            },
          ];
          quiz.questionCount = 2;
          store.put(data, "library");
        };
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
      });
    });
    await page.reload();
    await page
      .getByRole("button", { name: "Layout quiz 1", exact: true })
      .click();
    const front = page.locator('.flashcard-front[aria-hidden="false"]');
    await expect(page.getByText("Card 1 of 2", { exact: true })).toBeVisible();
    await expect(
      front.getByRole("img", { name: "Question picture", exact: true }),
    ).toHaveCount(1);
    await expect(page.locator(".flashcard-content-controls")).toHaveCount(0);
    const answer = front.getByRole("button", {
      name: "A. First answer",
      exact: true,
    });
    await answer.scrollIntoViewIfNeeded();
    await answer.click();
    await expect(answer).toBeDisabled();
    await expect(page.getByText("Card 1 of 2", { exact: true })).toBeVisible();
    await expect(
      front.getByRole("img", { name: "Question picture", exact: true }),
    ).toHaveCount(1);
    await page.getByRole("button", { name: "Next card", exact: true }).click();
    await expect(page.getByText("Card 2 of 2", { exact: true })).toBeVisible();
    await expect(front).toContainText("Second question");
    await expect(
      front.getByRole("img", { name: "Question picture", exact: true }),
    ).toHaveCount(0);
  });
}

test("partial multiple answers cannot show Finish session or restore as a completed session", async ({
  page,
}) => {
  await loadLayoutFixtures(page);
  await page.evaluate(async () => {
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
        Object.assign(data.quizzes[0].questions[0], {
          type: "multiple",
          prompt: "Choose two planets",
          options: ["Mars", "Moon", "Earth"],
          accepted: ["Mars", "Earth"],
          correctOptions: [0, 2],
        });
        store.put(data, "library");
      };
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
    });
  });
  await page.reload();
  await page
    .getByRole("button", { name: "Layout quiz 1", exact: true })
    .click();
  await page.getByRole("button", { name: "A. Mars", exact: true }).click();
  await page.getByRole("button", { name: "SATISFIED", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Finish session", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Review unanswered", exact: true }),
  ).toBeVisible();
  await expect
    .poll(
      async () => Object.keys((await stored(page)).studyProgress || {}).length,
    )
    .toBe(1);
  const backup = await stored(page);
  backup.studyProgress["layout-0"].complete = true;
  await page
    .getByRole("button", { name: "Back to discover", exact: true })
    .click();
  await openSettings(page);
  await page
    .getByRole("button", {
      name: "Import quizzes / restore backup",
      exact: true,
    })
    .click();
  await page.getByLabel("Quiz or backup JSON").fill(JSON.stringify(backup));
  await page
    .getByRole("button", {
      name: "Restore backup and replace local data",
      exact: true,
    })
    .click();
  await expect(page.getByRole("alert")).toContainText("Invalid study progress");
  expect((await stored(page)).studySessions || []).toHaveLength(0);
});

test("browsing existing quizzes uses no database writes and still works when writes fail", async ({
  page,
  context,
}) => {
  await loadLayoutFixtures(page);
  await context.addInitScript(() => {
    Object.assign(window, { auditWrites: 0 });
    IDBObjectStore.prototype.put = function () {
      (window as any).auditWrites++;
      throw new DOMException("Test storage is full", "QuotaExceededError");
    };
  });
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Layout quiz 1", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "My quizzes", exact: true }).click();
  await expect(page.locator(".quiz-card")).toHaveCount(6);
  await expect(page.getByRole("alert")).toHaveCount(0);
  expect(await page.evaluate(() => (window as any).auditWrites)).toBe(0);
});

test("refresh resets a short-screen card to the top of its content", async ({
  page,
}) => {
  await page.setViewportSize({ width: 568, height: 320 });
  await loadLayoutFixtures(page);
  await page
    .getByRole("button", { name: "Layout quiz 1", exact: true })
    .click();
  const reveal = page.getByRole("button", {
    name: "Reveal answer",
    exact: true,
  });
  await reveal.focus();
  await expect(reveal).toBeInViewport({ ratio: 1 });
  const scroller = page.locator(
    '.flashcard-front[aria-hidden="false"] .flashcard-face-viewport',
  );
  await scroller.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  expect(
    await scroller.evaluate((element) => element.scrollTop),
  ).toBeGreaterThan(0);
  await page.getByRole("button", { name: "Start again", exact: true }).click();
  await expect
    .poll(() => scroller.evaluate((element) => element.scrollTop))
    .toBe(0);
  await expect(
    page.getByRole("group", { name: "Card content pages", exact: true }),
  ).toHaveCount(0);
});
