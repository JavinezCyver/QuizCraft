import { stat } from "node:fs/promises";
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

async function edit(page: Page) {
  await page.bringToFront();
  const menu = page.getByRole("button", {
    name: "Open navigation",
    exact: true,
  });
  if (await menu.isVisible()) await menu.click();
  await page.getByRole("button", { name: "My quizzes", exact: true }).click();
  await page
    .locator(".quiz-card")
    .first()
    .getByRole("button", { name: "Edit quiz", exact: true })
    .click();
  await expect(page.getByLabel("Quiz title", { exact: true })).toBeVisible();
}

test("two editors merge independent saves, keep merged fields through autosave and allow reverting them", async ({
  page,
  context,
}) => {
  await loadLayoutFixtures(page);
  const other = await context.newPage();
  await other.goto("/");
  await expect(other.locator("#startup-splash")).toHaveCount(0);
  await edit(page);
  await edit(other);
  await page.bringToFront();
  await page
    .getByLabel("Quiz title", { exact: true })
    .fill("First tab's title");
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(page.getByLabel("Quiz title", { exact: true })).toHaveCount(0);
  await other.bringToFront();
  await other
    .getByRole("textbox", { name: /^Description/ })
    .fill("Second tab's description");
  await expect
    .poll(async () => (await stored(other)).quizzes[0].description)
    .toBe("Second tab's description");
  await expect(other.getByLabel("Quiz title", { exact: true })).toHaveValue(
    "First tab's title",
  );
  await other
    .getByRole("textbox", { name: /^Description/ })
    .fill("Second edit after merging");
  await expect
    .poll(async () => (await stored(other)).quizzes[0].description)
    .toBe("Second edit after merging");
  expect((await stored(other)).quizzes[0].title).toBe("First tab's title");
  await other.getByLabel("Quiz title", { exact: true }).fill("Layout quiz 1");
  await other.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(other.getByLabel("Quiz title", { exact: true })).toHaveCount(0);
  expect((await stored(other)).quizzes[0]).toMatchObject({
    title: "Layout quiz 1",
    description: "Second edit after merging",
  });
});

test("conflicting saves keep the first saved value and retain the other editor's text", async ({
  page,
  context,
}) => {
  await loadLayoutFixtures(page);
  const other = await context.newPage();
  await other.goto("/");
  await expect(other.locator("#startup-splash")).toHaveCount(0);
  await edit(page);
  await edit(other);
  await page.bringToFront();
  await page
    .getByLabel("Quiz title", { exact: true })
    .fill("Saved in the first tab");
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(page.getByLabel("Quiz title", { exact: true })).toHaveCount(0);
  await other.bringToFront();
  await other
    .getByLabel("Quiz title", { exact: true })
    .fill("Still editing in the second tab");
  await other.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(other.getByRole("alert")).toContainText(
    "title changed in another tab",
  );
  await expect(other.getByLabel("Quiz title", { exact: true })).toHaveValue(
    "Still editing in the second tab",
  );
  expect((await stored(other)).quizzes[0].title).toBe("Saved in the first tab");
});

test("Android back refreshes the quiz list after the pending draft save finishes", async ({
  page,
}) => {
  await loadLayoutFixtures(page);
  await edit(page);
  await page
    .getByLabel("Quiz title", { exact: true })
    .fill("Saved before returning to the list");
  await page.evaluate(() => window.dispatchEvent(new Event("quizcraft-back")));
  await expect(
    page.getByRole("button", {
      name: "Saved before returning to the list",
      exact: true,
    }),
  ).toBeVisible();
  expect((await stored(page)).quizzes[0].title).toBe(
    "Saved before returning to the list",
  );
});

test("the 500-question limit keeps existing questions editable and saveable", async ({
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
        const quiz = data.quizzes[0];
        quiz.questions = Array.from({ length: 500 }, (_, index) => ({
          ...quiz.questions[0],
          id: `card-${index}`,
        }));
        quiz.questionCount = 500;
        store.put(data, "library");
      };
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
    });
  });
  await page.reload();
  await expect(page.locator("#startup-splash")).toHaveCount(0);
  await edit(page);
  await expect(
    page.getByRole("button", { name: "Add blank question", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "New Question", exact: true }),
  ).toBeDisabled();
  await expect(page.getByRole("status")).toContainText("500 questions");
  await page
    .getByLabel("Quiz title", { exact: true })
    .fill("All 500 cards are still editable");
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(page.getByLabel("Quiz title", { exact: true })).toHaveCount(0);
  expect((await stored(page)).quizzes[0].questions).toHaveLength(500);
  await edit(page);
  await page
    .getByRole("button", { name: "Delete question", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "New Question", exact: true }),
  ).toBeEnabled();
});

test("backup restore preserves creation dates and play counts", async ({
  page,
}) => {
  await loadLayoutFixtures(page);
  const before = (await stored(page)).quizzes.map((q: any) => ({
    id: q.id,
    created: q.created,
    plays: q.plays || 0,
  }));
  await openSettings(page);
  await page
    .getByRole("button", { name: "Export backup", exact: true })
    .click();
  await page
    .getByRole("button", {
      name: "Restore backup and replace local data",
      exact: true,
    })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(
    (await stored(page)).quizzes.map((q: any) => ({
      id: q.id,
      created: q.created,
      plays: q.plays || 0,
    })),
  ).toEqual(before);
});

test("an exported photo backup larger than 30 MB can be selected and restored", async ({
  page,
}, testInfo) => {
  test.setTimeout(90000);
  await loadLayoutFixtures(page);
  await page.evaluate(async () => {
    const canvas = document.createElement("canvas");
    canvas.width = 1000;
    canvas.height = 1000;
    const ctx = canvas.getContext("2d")!;
    const image = ctx.createImageData(1000, 1000);
    let value = 123456;
    for (let i = 0; i < image.data.length; i += 4) {
      value = (Math.imul(value, 1664525) + 1013904223) >>> 0;
      image.data[i] = value & 255;
      image.data[i + 1] = (value >>> 8) & 255;
      image.data[i + 2] = (value >>> 16) & 255;
      image.data[i + 3] = 255;
    }
    ctx.putImageData(image, 0, 0);
    const photo = canvas.toDataURL("image/jpeg", 0.85);
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
        quiz.questions = Array.from({ length: 17 }, (_, index) => ({
          ...quiz.questions[0],
          id: `photo-${index}`,
          questionImage: photo,
          answerImage: photo,
        }));
        quiz.questionCount = 17;
        store.put(data, "library");
      };
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
    });
  });
  await page.reload();
  await expect(page.locator("#startup-splash")).toHaveCount(0);
  await openSettings(page);
  await page
    .getByRole("button", { name: "Export backup", exact: true })
    .click();
  const pending = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Download JSON", exact: true })
    .click();
  const download = await pending;
  const path = testInfo.outputPath("photo-backup.json");
  await download.saveAs(path);
  expect((await stat(path)).size).toBeGreaterThan(30_000_000);
  await page.getByLabel("Quiz or backup JSON").fill("");
  await page.getByLabel("Choose a QuizCraft JSON file").setInputFiles(path);
  await expect
    .poll(
      () =>
        page
          .getByLabel("Quiz or backup JSON")
          .evaluate((el: HTMLTextAreaElement) => el.value.length),
      { timeout: 30000 },
    )
    .toBeGreaterThan(30_000_000);
  await page
    .getByRole("button", {
      name: "Restore backup and replace local data",
      exact: true,
    })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0, { timeout: 30000 });
  await expect(
    page.getByRole("button", { name: "Layout quiz 1", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Edit quiz", exact: true }).click();
  await expect(page.getByAltText("Question picture preview")).toBeVisible();
});
