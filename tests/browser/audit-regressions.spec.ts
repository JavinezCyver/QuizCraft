import { test, expect, type Page } from "@playwright/test";
import { loadLayoutFixtures } from "./layout-fixture";
import { openSettings, createQuiz } from "./navigation";

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

async function openSection(page: Page, name: string) {
  const toggle = page.getByRole("button", {
    name: "Open navigation",
    exact: true,
    includeHidden: true,
  });
  await toggle.waitFor({ state: "attached" });
  if (
    (await toggle.isVisible()) &&
    (await toggle.getAttribute("aria-expanded")) !== "true"
  )
    await toggle.click();
  await page.getByRole("button", { name, exact: true }).click();
}

for (const [width, height] of [
  [320, 568],
  [1440, 900],
]) {
  test(`self-assessed imported answers receive full credit and history fits at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height });
    await loadLayoutFixtures(page);
    const quiz = (await stored(page)).quizzes[0];
    quiz.title = "Self-assessed response";
    quiz.questions[0] = {
      ...quiz.questions[0],
      type: "short",
      prompt: "Describe your learning goal",
      options: [],
      accepted: [],
    };
    await openSettings(page);
    await page
      .getByRole("button", {
        name: "Import quizzes / restore backup",
        exact: true,
      })
      .click();
    await page
      .getByLabel("Quiz or backup JSON")
      .fill(JSON.stringify({ quizzes: [quiz] }));
    await page
      .getByRole("button", { name: "Import quizzes", exact: true })
      .click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await openSection(page, "My quizzes");
    await page.getByRole("button", { name: quiz.title, exact: true }).click();
    await page
      .getByRole("textbox", { name: "Your answer", exact: true })
      .fill("Practice each day and review my mistakes.");
    await page.getByRole("button", { name: "SATISFIED", exact: true }).click();
    await page
      .getByRole("button", { name: "Finish session", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Session complete", exact: true }),
    ).toBeVisible();
    const session = (await stored(page)).studySessions[0];
    expect({
      score: session.score,
      maximum: session.maximum,
      correct: session.correct,
    }).toEqual({ score: 10, maximum: 10, correct: 1 });
    await page
      .getByRole("button", { name: "Back to my quizzes", exact: true })
      .click();
    await openSection(page, "Quiz history");
    await expect(
      page.locator('.history-table-row [data-label="Score"]'),
    ).toHaveText("100%");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth - innerWidth,
      ),
    ).toBeLessThanOrEqual(1);
  });

  test(`editing a satisfied typed answer updates its rating and persists at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height });
    await loadLayoutFixtures(page);
    await page.evaluate(async () => {
      const db = await new Promise<IDBDatabase>((resolve) => {
        const r = indexedDB.open("quizcraft-offline", 1);
        r.onsuccess = () => resolve(r.result);
      });
      await new Promise<void>((resolve) => {
        const tx = db.transaction("data", "readwrite"),
          store = tx.objectStore("data"),
          request = store.get("library");
        request.onsuccess = () => {
          const data = request.result;
          Object.assign(data.quizzes[0].questions[0], {
            type: "blank",
            prompt: "Name our star",
            options: [],
            accepted: ["Sun"],
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
    const answer = page.getByRole("textbox", {
      name: "Your answer",
      exact: true,
    });
    const satisfied = page.getByRole("button", {
      name: "SATISFIED",
      exact: true,
    });
    await answer.fill("Sun");
    await satisfied.click();
    await answer.fill("  SUN  ");
    await expect(satisfied).toHaveAttribute("aria-pressed", "true");
    await answer.fill("Moon");
    await expect(
      page.getByRole("button", { name: "BAD", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(
      page.getByRole("img", { name: "Card 1: bad", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Finish session", exact: true }),
    ).toHaveCount(0);
    await expect
      .poll(
        async () =>
          (await stored(page)).studyProgress["layout-0"].typedAnswers[
            "question-0"
          ],
      )
      .toBe("Moon");
    await page.reload();
    await expect(answer).toHaveValue("Moon");
    await expect(
      page.getByRole("button", { name: "BAD", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await answer.fill("Sun");
    await satisfied.click();
    await answer.fill("");
    await expect(
      page.getByRole("button", { name: "UNRATED", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth - innerWidth,
      ),
    ).toBeLessThanOrEqual(1);
  });
}

test("published imports and restores reject missing answer keys atomically while drafts remain importable", async ({
  page,
}) => {
  await loadLayoutFixtures(page);
  const backup = await stored(page);
  const valid = backup.quizzes[0];
  const card = valid.questions[0];
  await openSettings(page);
  await page
    .getByRole("button", {
      name: "Import quizzes / restore backup",
      exact: true,
    })
    .click();
  const text = page.getByLabel("Quiz or backup JSON");
  for (const questions of [
    [],
    [{ ...card, type: "blank", options: [], accepted: [] }],
    [
      {
        ...card,
        type: "boolean",
        options: ["True", "False"],
        accepted: ["True", "False"],
        correctOptions: [0, 1],
      },
    ],
    [
      {
        ...card,
        type: "multiple",
        options: ["Mars", "Moon"],
        accepted: ["Mars"],
        correctOptions: [],
      },
    ],
  ]) {
    await text.fill(
      JSON.stringify({
        quizzes: [
          valid,
          { ...valid, title: "Invalid published deck", questions },
        ],
      }),
    );
    await page
      .getByRole("button", { name: "Import quizzes", exact: true })
      .click();
    await expect(page.getByRole("alert")).toContainText(
      "Complete every question",
    );
    expect((await stored(page)).quizzes).toHaveLength(6);
  }
  const invalidBackup = structuredClone(backup);
  invalidBackup.quizzes[0].questions[0] = {
    ...card,
    type: "blank",
    options: [],
    accepted: [],
  };
  await text.fill(JSON.stringify(invalidBackup));
  await page
    .getByRole("button", {
      name: "Restore backup and replace local data",
      exact: true,
    })
    .click();
  await expect(page.getByRole("alert")).toContainText(
    "Complete every question",
  );
  expect((await stored(page)).quizzes).toEqual(backup.quizzes);
  await text.fill(
    JSON.stringify({ quizzes: [{ ...valid, status: "draft", questions: [] }] }),
  );
  await page
    .getByRole("button", { name: "Import quizzes", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect((await stored(page)).quizzes).toHaveLength(7);
});

for (const width of [390, 1440]) {
  test(`a failed draft save recovers both questions after reload at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    await createQuiz(page);
    await expect(
      page.getByRole("button", { name: "Add first question", exact: true }),
    ).toBeVisible();
    await page.evaluate(() => {
      IDBObjectStore.prototype.put = function () {
        throw new DOMException(
          "Simulated storage write failure",
          "QuotaExceededError",
        );
      };
    });
    await page
      .getByRole("button", { name: "Add first question", exact: true })
      .click();
    const field = page.getByRole("textbox", {
      name: "Your question",
      exact: true,
    });
    await field.fill("First recovered question");
    await page
      .getByLabel("Accepted answers (one per line)")
      .fill("First answer");
    await page
      .getByRole("button", { name: "New Question", exact: true })
      .click();
    await field.fill("Second recovered question");
    await page
      .getByRole("button", { name: "Previous question", exact: true })
      .click();
    await page.getByRole("button", { name: "Save draft", exact: true }).click();
    await expect(page.getByRole("alert")).toContainText(
      "Simulated storage write failure",
    );
    expect(
      await page.evaluate(
        () =>
          Object.keys(sessionStorage).filter((key) =>
            key.startsWith("quizcraft-draft-recovery:"),
          ).length,
      ),
    ).toBe(1);
    await page.reload();
    await openSection(page, "My quizzes");
    await page.getByRole("button", { name: "Edit quiz", exact: true }).click();
    await expect(field).toHaveText("First recovered question");
    await expect(
      page.getByLabel("Accepted answers (one per line)"),
    ).toHaveValue("First answer");
    await expect
      .poll(async () => (await stored(page)).quizzes[0].questions.length)
      .toBe(2);
    await page
      .getByRole("button", { name: "Next question", exact: true })
      .click();
    await expect(field).toHaveText("Second recovered question");
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            Object.keys(sessionStorage).filter((key) =>
              key.startsWith("quizcraft-draft-recovery:"),
            ).length,
        ),
      )
      .toBe(0);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth - innerWidth,
      ),
    ).toBeLessThanOrEqual(1);
  });
}

test("successful backup replacement clears old draft recovery while rejected restores preserve it", async ({
  page,
}) => {
  await loadLayoutFixtures(page);
  const backup = await stored(page);
  const original = backup.quizzes[0];
  const key = `quizcraft-draft-recovery:${original.id}`;
  const studyKey = `quizcraft-study-recovery:${original.id}`;
  await page.evaluate(
    (key) => sessionStorage.setItem(key, "pending progress"),
    studyKey,
  );
  await page.evaluate(
    ({ key, original }) =>
      sessionStorage.setItem(
        key,
        JSON.stringify({
          owner: "previous-editor",
          base: original,
          draft: { ...original, title: "Unsaved pre-restore title" },
        }),
      ),
    { key, original },
  );
  await openSettings(page);
  await page
    .getByRole("button", {
      name: "Import quizzes / restore backup",
      exact: true,
    })
    .click();
  const text = page.getByLabel("Quiz or backup JSON");
  const restore = page.getByRole("button", {
    name: "Restore backup and replace local data",
    exact: true,
  });
  await text.fill(JSON.stringify({ ...backup, version: 2 }));
  await restore.click();
  await expect(page.getByRole("alert")).toContainText(
    "Invalid QuizCraft backup",
  );
  expect(
    await page.evaluate((key) => sessionStorage.getItem(key), key),
  ).not.toBeNull();
  await text.fill(JSON.stringify(backup));
  await restore.click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(
    await page.evaluate((key) => sessionStorage.getItem(key), key),
  ).toBeNull();
  expect(
    await page.evaluate((key) => sessionStorage.getItem(key), studyKey),
  ).toBeNull();
  await openSection(page, "My quizzes");
  await page
    .locator(".quiz-card")
    .filter({
      has: page.getByRole("button", { name: original.title, exact: true }),
    })
    .getByRole("button", { name: "Edit quiz", exact: true })
    .click();
  await expect(
    page.getByRole("textbox", { name: "Quiz title", exact: true }),
  ).toHaveValue(original.title);
});

for (const width of [390, 1440]) {
  test(`pending study answers and ratings recover after a failed write and reload at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await loadLayoutFixtures(page);
    await page
      .getByRole("button", { name: "Layout quiz 1", exact: true })
      .click();
    await expect
      .poll(async () => !!(await stored(page)).studyProgress?.["layout-0"])
      .toBe(true);
    await page.evaluate(() => {
      IDBObjectStore.prototype.put = function () {
        throw new DOMException(
          "Simulated progress write failure",
          "QuotaExceededError",
        );
      };
    });
    await page.getByRole("button", { name: "A. True", exact: true }).click();
    await page.getByRole("button", { name: "SATISFIED", exact: true }).click();
    await expect(page.getByRole("alert")).toContainText(
      "Study progress could not be saved",
    );
    expect(
      await page.evaluate(() =>
        sessionStorage.getItem("quizcraft-study-recovery:layout-0"),
      ),
    ).not.toBeNull();
    await page.reload();
    await expect(
      page.getByRole("button", { name: "A. True", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(
      page.getByRole("button", { name: "SATISFIED", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect
      .poll(
        async () =>
          (await stored(page)).studyProgress?.["layout-0"]?.ratings?.[
            "question-0"
          ],
      )
      .toBe("satisfied");
    const pending = (await stored(page)).studyProgress["layout-0"];
    await page
      .getByRole("button", { name: "Finish session", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Session complete", exact: true }),
    ).toBeVisible();
    // A late pre-completion snapshot cannot reopen an already committed result.
    await page.evaluate(
      (progress) =>
        sessionStorage.setItem(
          "quizcraft-study-recovery:layout-0",
          JSON.stringify(progress),
        ),
      pending,
    );
    await page.reload();
    await expect(
      page.getByRole("heading", { name: "Session complete", exact: true }),
    ).toBeVisible();
    expect((await stored(page)).studySessions).toHaveLength(1);
    await expect
      .poll(() =>
        page.evaluate(() =>
          sessionStorage.getItem("quizcraft-study-recovery:layout-0"),
        ),
      )
      .toBeNull();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth - innerWidth,
      ),
    ).toBeLessThanOrEqual(1);
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

test("a completed backup with an incorrect satisfied answer cannot bypass review", async ({
  page,
}) => {
  await loadLayoutFixtures(page);
  await page
    .getByRole("button", { name: "Layout quiz 1", exact: true })
    .click();
  await page.getByRole("button", { name: "B. False", exact: true }).click();
  await page.getByRole("button", { name: "SATISFIED", exact: true }).click();
  await expect
    .poll(
      async () =>
        (await stored(page)).studyProgress?.["layout-0"]?.ratings?.[
          "question-0"
        ],
    )
    .toBe("bad");
  const backup = await stored(page);
  backup.studyProgress["layout-0"].complete = true;
  backup.studyProgress["layout-0"].ratings["question-0"] = "satisfied";
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
  expect((await stored(page)).quizzes).toHaveLength(6);
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
