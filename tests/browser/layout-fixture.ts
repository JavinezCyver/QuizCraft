import { expect, type Page } from "@playwright/test";

// Layout samples are created by the test, never included in the application.
export async function loadLayoutFixtures(page: Page) {
  await page.goto("/");
  await expect(
    page.getByRole("heading", {
      name: "Your library starts here",
      exact: true,
    }),
  ).toBeVisible();
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
        data.quizzes = Array.from({ length: 6 }, (_, index) => ({
          id: `layout-${index}`,
          owner: "local",
          creator: "You",
          title: `Layout quiz ${index + 1}`,
          description: "A quiz for checking responsive layouts.",
          category: "Science",
          difficulty: "Easy",
          theme: "purple",
          cover: "",
          visibility: "public",
          status: "published",
          questionCount: 1,
          created: "2026-01-01T00:00:00.000Z",
          settings: {
            guests: true,
            review: true,
            showAnswers: true,
            rankings: false,
            passing: 70,
            time: 0,
            randomQuestions: false,
            randomAnswers: false,
            layout: "single",
          },
          questions: [
            {
              id: `question-${index}`,
              type: "boolean",
              prompt: "Study offline?",
              options: ["True", "False"],
              accepted: ["True"],
              explanation: "Yes.",
              points: 10,
            },
          ],
        }));
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
