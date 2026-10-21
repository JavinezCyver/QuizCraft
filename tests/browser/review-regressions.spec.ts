import { test, expect, type Page } from "@playwright/test";
import { loadLayoutFixtures } from "./layout-fixture";
import { openSettings } from "./navigation";

async function library(page: Page) {
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

async function seed(page: Page, patch: any = {}, extraDeck = false) {
  await loadLayoutFixtures(page);
  await page.evaluate(
    async ({ patch, extraDeck }) => {
      const db = await new Promise<IDBDatabase>((resolve) => {
        const request = indexedDB.open("quizcraft-offline", 1);
        request.onsuccess = () => resolve(request.result);
      });
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction("data", "readwrite");
        const store = tx.objectStore("data");
        const request = store.get("library");
        request.onsuccess = () => {
          const data = request.result;
          const quiz = Object.assign(data.quizzes[0], patch);
          data.quizzes = extraDeck ? [data.quizzes[1], quiz] : [quiz];
          store.put(data, "library");
        };
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => reject(tx.error);
      });
    },
    { patch, extraDeck },
  );
  await page.reload();
  await expect(page.locator("#startup-splash")).toHaveCount(0);
}

async function edit(page: Page) {
  await page.getByRole("button", { name: "My quizzes", exact: true }).click();
  await page
    .locator(".quiz-card")
    .filter({
      has: page.getByRole("button", { name: "Layout quiz 1", exact: true }),
    })
    .getByRole("button", { name: "Edit quiz", exact: true })
    .click();
  await expect(
    page.getByRole("textbox", { name: "Your question", exact: true }),
  ).toBeVisible();
}

async function finish(page: Page, option = "A. True") {
  await page.getByRole("button", { name: option, exact: true }).click();
  await page.getByRole("button", { name: "SATISFIED", exact: true }).click();
  await page
    .getByRole("button", { name: "Finish session", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Session complete", exact: true }),
  ).toBeVisible();
}

for (const [visibility, index] of [
  ["unlisted", 0],
  ["private", 1],
] as const) {
  test(`publishing retains ${visibility} visibility and keeps the deck out of Discover`, async ({
    page,
  }) => {
    await seed(page);
    await edit(page);
    await page.getByRole("button", { name: /Flashcard settings/ }).click();
    await page
      .getByRole("combobox", { name: "Visibility", exact: true })
      .click();
    await page
      .getByRole("option", { name: "Only in My quizzes", exact: true })
      .nth(index)
      .click();
    await page
      .getByRole("button", { name: "Publish quiz", exact: true })
      .first()
      .click();
    await expect(
      page.getByRole("button", { name: "Layout quiz 1", exact: true }),
    ).toBeVisible();
    expect((await library(page)).quizzes[0]).toMatchObject({
      status: "published",
      visibility,
    });
    await page.getByRole("button", { name: "Discover", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Layout quiz 1", exact: true }),
    ).toHaveCount(0);
  });
}

test("preview starts fresh and leaves real answers, ratings, history and usage untouched", async ({
  page,
}) => {
  await seed(page);
  await page
    .getByRole("button", { name: "Layout quiz 1", exact: true })
    .click();
  await page.getByRole("button", { name: "B. False", exact: true }).click();
  await page.getByRole("button", { name: "BAD", exact: true }).click();
  await page.keyboard.press("Escape");
  const before = await library(page);
  await edit(page);
  await page.getByRole("button", { name: "Preview", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "BAD", exact: true }),
  ).toHaveAttribute("aria-pressed", "false");
  await expect(
    page.getByRole("button", { name: "B. False", exact: true }),
  ).toHaveAttribute("aria-pressed", "false");
  await finish(page);
  const after = await library(page);
  expect(after.studyProgress).toEqual(before.studyProgress);
  expect(after.studySessions || []).toEqual(before.studySessions || []);
  expect(after.quizzes[0].plays).toBe(0);
  await page.keyboard.press("Escape");
  await page
    .getByRole("button", { name: "Layout quiz 1", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "BAD", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    page.getByRole("button", { name: "B. False", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
});

test("partial-word italics survive Preview and reopening the editor", async ({
  page,
}) => {
  await seed(page);
  await edit(page);
  const field = page.getByRole("textbox", {
    name: "Your question",
    exact: true,
  });
  await field.fill("Batman");
  await field.evaluate((element) => {
    element.focus();
    const range = document.createRange();
    range.setStart(element.firstChild!, 1);
    range.setEnd(element.firstChild!, 4);
    const selection = window.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);
  });
  await page.getByRole("button", { name: "Italic", exact: true }).click();
  await page.getByRole("button", { name: "Preview", exact: true }).click();
  const prompt = page.locator(
    '.flashcard-front[aria-hidden="false"] .flashcard-text',
  );
  await expect(prompt).toHaveText("Batman");
  await expect(prompt.locator("em")).toHaveText("atm");
  await page.keyboard.press("Escape");
  await edit(page);
  await expect(field).toHaveText("Batman");
  await expect(field.locator("em")).toHaveText("atm");
});

const duplicateQuestion = {
  id: "duplicate",
  type: "multiple",
  prompt: "Choose the marked answer",
  options: ["Same", "Same", "Other"],
  accepted: ["Same"],
  correctOptions: [0],
  explanation: "",
  points: 10,
};

test("publishing blocks duplicate choices and succeeds after renaming one", async ({
  page,
}) => {
  await seed(page, { status: "draft", questions: [duplicateQuestion] });
  await edit(page);
  await page
    .getByRole("button", { name: "Publish quiz", exact: true })
    .first()
    .click();
  await expect(page.getByRole("alert")).toContainText(
    "Answer choices must be different",
  );
  expect((await library(page)).quizzes[0].status).toBe("draft");
  await page
    .getByRole("textbox", { name: "Option 2", exact: true })
    .fill("Different");
  await page
    .getByRole("button", { name: "Publish quiz", exact: true })
    .first()
    .click();
  await expect(
    page.getByRole("textbox", { name: "Search quizzes", exact: true }),
  ).toBeVisible();
  expect((await library(page)).quizzes[0].status).toBe("published");
});

test("existing duplicate choices score by identity after shuffle and resume", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Math.random = () => 0;
  });
  await seed(page, {
    questions: [duplicateQuestion],
    settings: {
      guests: true,
      review: true,
      showAnswers: true,
      rankings: false,
      passing: 70,
      time: 0,
      randomQuestions: false,
      randomAnswers: true,
      layout: "single",
    },
  });
  await page
    .getByRole("button", { name: "Layout quiz 1", exact: true })
    .click();
  await page.getByRole("button", { name: "A. Same", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "A. Same", exact: true }),
  ).toHaveAttribute("data-answer-state", "incorrect");
  await page.reload();
  await expect(
    page.getByRole("button", { name: "A. Same", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "SATISFIED", exact: true }).click();
  await page
    .getByRole("button", { name: "Finish session", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Session complete", exact: true }),
  ).toBeVisible();
  let data = await library(page);
  expect(data.studyProgress["layout-0"].optionIndices.duplicate).toEqual([
    1, 2, 0,
  ]);
  expect(data.studySessions[0].score).toBe(0);
  await page.getByRole("button", { name: "Start again", exact: true }).click();
  await finish(page, "C. Same");
  data = await library(page);
  expect(data.studySessions.map((session: any) => session.score)).toEqual([
    0, 10,
  ]);
});

test("completing flashcards updates popularity immediately and preserves usage across editing and reload", async ({
  page,
}) => {
  await seed(page, {}, true);
  await page
    .getByRole("button", { name: "Layout quiz 1", exact: true })
    .click();
  await finish(page);
  await page.keyboard.press("Escape");
  await expect(page.locator(".quiz-card .card-title").first()).toHaveText(
    "Layout quiz 1",
  );
  await expect(page.locator(".quiz-card .plays").first()).toHaveText("1");
  await edit(page);
  await page
    .getByRole("textbox", { name: "Description", exact: true })
    .fill("Usage must survive a draft save.");
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(
    page
      .locator(".quiz-card")
      .filter({ hasText: "Layout quiz 1" })
      .locator(".plays"),
  ).toHaveText("1");
  await page.reload();
  await page.getByRole("button", { name: "My quizzes", exact: true }).click();
  await expect(
    page
      .locator(".quiz-card")
      .filter({ hasText: "Layout quiz 1" })
      .locator(".plays"),
  ).toHaveText("1");
  expect((await library(page)).studySessions).toHaveLength(1);
});

for (const [width, height] of [
  [320, 568],
  [568, 320],
]) {
  test(`long picture cards remain readable by scrolling within one card at ${width}x${height}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height });
    await page.emulateMedia({ reducedMotion: "reduce" });
    const prompt =
      "Read the situation carefully. " +
      "The learner compares the observations, records results, and checks the evidence before reaching a conclusion. ".repeat(
        7,
      ) +
      "FINALQUESTIONWORD.";
    const options = [
      "Observe the results and compare the evidence before deciding.",
      "Ignore the results and choose the first explanation.",
      "Repeat the experiment and document changes in the results.",
      "Consider the question and check the original notes.",
    ];
    const picture =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jhH8AAAAASUVORK5CYII=";
    await seed(page, {
      questions: [
        {
          ...duplicateQuestion,
          prompt,
          options,
          accepted: [options[0]],
          questionImage: picture,
          answerImage: picture,
        },
      ],
    });
    await page
      .getByRole("button", { name: "Layout quiz 1", exact: true })
      .click();
    const face = page.locator('.flashcard-front[aria-hidden="false"]');
    const scroller = face.locator(".flashcard-face-viewport");
    await expect(page.getByRole("group", { name: "Card content pages", exact: true })).toHaveCount(0);
    await page.screenshot({
      path: `test-results/readable-picture-front-${width}x${height}.png`,
    });
    const optionsSeen = new Set<number>();
    const linesSeen = new Set<number>();
    let totalLines = 0;
    let questionEndSeen = false;
    for (let step = 0; step < 40; step++) {
      const visible = await face.evaluate((element) => {
        const viewport = element
          .querySelector<HTMLElement>(".flashcard-face-viewport")!
          .getBoundingClientRect();
        const content = element.querySelector<HTMLElement>(
          ".flashcard-face-content",
        )!;
        const text = element.querySelector<HTMLElement>(".flashcard-text")!;
        const textNode = text.firstChild!;
        const range = document.createRange();
        const start = textNode.textContent!.indexOf("FINALQUESTIONWORD");
        range.setStart(textNode, start);
        range.setEnd(textNode, start + 17);
        const last = range.getBoundingClientRect();
        const matrix = new DOMMatrix(getComputedStyle(content).transform);
        const allText = document.createRange();
        allText.selectNodeContents(text);
        const lines = [...allText.getClientRects()];
        return {
          totalLines: lines.length,
          lines: lines.flatMap((line, index) =>
            line.top >= viewport.top - 1 && line.bottom <= viewport.bottom + 1
              ? [index]
              : [],
          ),
          fontSize: parseFloat(getComputedStyle(text).fontSize) * matrix.a,
          lastVisible:
            last.top >= viewport.top - 1 && last.bottom <= viewport.bottom + 1,
          options: [
            ...element.querySelectorAll<HTMLElement>(".flashcard-option"),
          ].flatMap((option, index) => {
            const box = option.getBoundingClientRect();
            return box.top >= viewport.top - 1 &&
              box.bottom <= viewport.bottom + 1
              ? [index]
              : [];
          }),
        };
      });
      expect(visible.fontSize).toBeGreaterThanOrEqual(14);
      visible.options.forEach((index) => optionsSeen.add(index));
      totalLines = visible.totalLines;
      visible.lines.forEach((index) => linesSeen.add(index));
      questionEndSeen ||= visible.lastVisible;
      const moved = await scroller.evaluate((element) => {
        const before = element.scrollTop;
        element.scrollTop += Math.max(1, element.clientHeight / 2);
        return element.scrollTop > before;
      });
      if (!moved) break;
    }
    expect(questionEndSeen).toBe(true);
    expect(linesSeen.size).toBe(totalLines);
    // A native scroller has continuous positions, rather than fixed page stops.
    // Check each control at its own scroll position as a user can do.
    for (const [index, option] of (await face.locator(".flashcard-option").all()).entries()) {
      await option.scrollIntoViewIfNeeded();
      const visible = await option.evaluate((element) => {
        const viewport = element.closest(".flashcard-face-viewport")!.getBoundingClientRect();
        const box = element.getBoundingClientRect();
        return box.top >= viewport.top - 1 && box.bottom <= viewport.bottom + 1;
      });
      expect(visible).toBe(true);
      optionsSeen.add(index);
    }
    expect([...optionsSeen].sort()).toEqual([0, 1, 2, 3]);
    await face
      .getByRole("button", { name: "Reveal answer", exact: true })
      .click();
    await expect(
      page.locator('.flashcard-back[aria-hidden="false"]'),
    ).toContainText(options[0]);
    const dialog = page.getByRole("dialog", { name: "Flashcard study mode" });
    await page.mouse.move(width / 2, height / 2);
    await page.mouse.wheel(0, 600);
    expect(await dialog.evaluate((element) => element.scrollTop)).toBe(0);
    expect(
      await dialog.evaluate(
        (element) => element.scrollHeight - element.clientHeight,
      ),
    ).toBeLessThanOrEqual(1);
    await expect(
      page.getByRole("button", { name: "SATISFIED", exact: true }),
    ).toBeInViewport({ ratio: 1 });
    await page.screenshot({
      path: `test-results/readable-picture-${width}x${height}.png`,
    });
  });
}

for (const mode of ["resume", "restore"] as const) {
  test(`old progress signatures and choice orders survive ${mode}`, async ({
    page,
  }) => {
    await seed(page);
    await page
      .getByRole("button", { name: "Layout quiz 1", exact: true })
      .click();
    await page.getByRole("button", { name: "B. False", exact: true }).click();
    await page.getByRole("button", { name: "BAD", exact: true }).click();
    await page.keyboard.press("Escape");
    const original = await library(page);
    const legacy = await page.evaluate(async (data) => {
      const quiz = data.quizzes[0];
      const digest = await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(
          JSON.stringify([quiz.questions, quiz.settings]),
        ),
      );
      const signature = [...new Uint8Array(digest)]
        .map((byte) => byte.toString(16).padStart(2, "0"))
        .join("");
      const progress = data.studyProgress[quiz.id];
      progress.signature = signature;
      delete progress.optionIndices;
      const db = await new Promise<IDBDatabase>((resolve) => {
        const request = indexedDB.open("quizcraft-offline", 1);
        request.onsuccess = () => resolve(request.result);
      });
      await new Promise<void>((resolve) => {
        const tx = db.transaction("data", "readwrite");
        tx.objectStore("data").put(data, "library");
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
      });
      return JSON.stringify(data);
    }, original);
    if (mode === "restore") {
      await openSettings(page);
      await page
        .getByRole("button", {
          name: "Import quizzes / restore backup",
          exact: true,
        })
        .click();
      await page.getByLabel("Quiz or backup JSON").fill(legacy);
      await page
        .getByRole("button", {
          name: "Restore backup and replace local data",
          exact: true,
        })
        .click();
      await expect(page.getByRole("dialog")).toHaveCount(0);
    } else {
      await page.reload();
    }
    await page
      .getByRole("button", { name: "Layout quiz 1", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "B. False", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(
      page.getByRole("button", { name: "BAD", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
  });
}

for (const correctOptions of [[0], [0, 2]]) {
  test(`saved choices resume in ${correctOptions.length === 1 ? "single" : "multiple"} selection mode`, async ({
    page,
  }) => {
    await seed(page, {
      questions: [
        {
          ...duplicateQuestion,
          options: ["First", "Second", "Third"],
          accepted: correctOptions.map(
            (index) => ["First", "Second", "Third"][index],
          ),
          correctOptions,
        },
      ],
    });
    await page
      .getByRole("button", { name: "Layout quiz 1", exact: true })
      .click();
    await page.getByRole("button", { name: "C. Third", exact: true }).click();
    await page.getByRole("button", { name: "BAD", exact: true }).click();
    await expect
      .poll(
        async () =>
          (await library(page)).studyProgress?.["layout-0"]?.ratings.duplicate,
      )
      .toBe("bad");
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
          data.studyProgress["layout-0"].selections.duplicate = [0, 2];
          store.put(data, "library");
        };
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
      });
    });
    await page.reload();
    await expect(
      page.getByRole("button", { name: "A. First", exact: true }),
    ).toHaveAttribute(
      "aria-pressed",
      correctOptions.length > 1 ? "true" : "false",
    );
    await expect(
      page.getByRole("button", { name: "C. Third", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(
      page.getByRole("button", { name: "BAD", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(
      (await library(page)).studyProgress["layout-0"].selections.duplicate,
    ).toEqual(correctOptions.length > 1 ? [0, 2] : [2]);
  });
}
