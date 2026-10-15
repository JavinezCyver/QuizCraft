import { createQuiz } from "./navigation";
import { test, expect, type Locator } from "@playwright/test";

test.use({ hasTouch: true, viewport: { width: 390, height: 844 } });

test("saving and previewing wait for question pictures to finish processing", async ({
  page,
}) => {
  await page.goto("/");
  await createQuiz(page);
  await page
    .getByLabel("Quiz title", { exact: true })
    .fill("Pending picture regression");
  await page
    .getByRole("button", { name: "Add first question", exact: true })
    .click();
  const png = await page.evaluate(() => {
    const NativeImage = window.Image;
    const descriptor = Object.getOwnPropertyDescriptor(
      HTMLImageElement.prototype,
      "src",
    )!;
    (window as any).Image = function (...args: any[]) {
      const image = new NativeImage(...(args as []));
      Object.defineProperty(image, "src", {
        get() {
          return descriptor.get!.call(this);
        },
        set(value) {
          (window as any).releasePicture = () =>
            descriptor.set!.call(image, value);
        },
      });
      return image;
    };
    const canvas = document.createElement("canvas");
    canvas.width = 120;
    canvas.height = 80;
    canvas.getContext("2d")!.fillRect(0, 0, 120, 80);
    return canvas.toDataURL("image/png").split(",")[1];
  });
  await page
    .getByLabel("Question picture", { exact: true })
    .setInputFiles({
      name: "pending.png",
      mimeType: "image/png",
      buffer: Buffer.from(png, "base64"),
    });
  await expect(page.locator(".card-image-upload [role=status]")).toBeVisible();
  for (const name of ["Save draft", "Preview", "Publish quiz"]) {
    await expect(
      page.getByRole("button", { name, exact: true }),
    ).toBeDisabled();
  }
  await expect(
    page.getByRole("button", { name: "Add blank question", exact: true }),
  ).toBeDisabled();
  await page.evaluate(() => (window as any).releasePicture());
  await expect(
    page.getByRole("img", { name: "Question picture preview", exact: true }),
  ).toBeVisible();
  const source = await page
    .getByRole("img", { name: "Question picture preview", exact: true })
    .getAttribute("src");
  await expect(
    page.getByRole("button", { name: "Save draft", exact: true }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await page.reload();
  await page
    .getByRole("button", { name: "Open navigation", exact: true })
    .click();
  await page.getByRole("button", { name: "My quizzes", exact: true }).click();
  await page.getByRole("button", { name: "Edit quiz", exact: true }).click();
  await expect(
    page.getByRole("img", { name: "Question picture preview", exact: true }),
  ).toHaveAttribute("src", source!);
});

test("every flashcard type supports separate question and answer pictures, replacement and removal", async ({
  page,
}) => {
  test.setTimeout(90000);
  await page.goto("/");
  await createQuiz(page);
  await page
    .getByLabel("Quiz title", { exact: true })
    .fill("Picture flashcards");
  const sizes = [
    [320, 568],
    [375, 667],
    [390, 844],
    [768, 1024],
    [1024, 768],
    [1440, 900],
    [1920, 1080],
    [568, 320],
    [844, 390],
  ];
  const checkImageLayout = async (picture: Locator, container: string) => {
    await picture.scrollIntoViewIfNeeded();
    const layout = await picture.evaluate((element, selector) => {
      const image = element as HTMLImageElement;
      const box = image.getBoundingClientRect();
      const parent = image.closest(selector)!;
      const bounds = parent.getBoundingClientRect();
      return {
        width: box.width,
        height: box.height,
        ratio: image.naturalWidth / image.naturalHeight,
        left: box.left - bounds.left,
        right: bounds.right - box.right,
        parentOverflow: parent.scrollWidth - parent.clientWidth,
        pageOverflow: document.documentElement.scrollWidth - innerWidth,
        viewportHeight: innerHeight,
      };
    }, container);
    expect(layout.width).toBeGreaterThan(0);
    expect(layout.height).toBeGreaterThan(0);
    expect(Math.abs(layout.width / layout.height - layout.ratio)).toBeLessThan(
      0.02,
    );
    expect(layout.left).toBeGreaterThanOrEqual(-1);
    expect(layout.right).toBeGreaterThanOrEqual(-1);
    expect(layout.parentOverflow).toBeLessThanOrEqual(1);
    expect(layout.pageOverflow).toBeLessThanOrEqual(1);
    expect(layout.height).toBeLessThanOrEqual(layout.viewportHeight * 0.65);
  };
  const makePicture = async (color: string, portrait = false) =>
    Buffer.from(
      await page.evaluate(
        ({ color, portrait }) => {
          const canvas = document.createElement("canvas");
          canvas.width = portrait ? 1200 : 2400;
          canvas.height = portrait ? 2400 : 1200;
          const context = canvas.getContext("2d")!;
          context.fillStyle = color;
          context.fillRect(0, 0, canvas.width, canvas.height);
          return canvas.toDataURL("image/png").split(",")[1];
        },
        { color, portrait },
      ),
      "base64",
    );
  const frontFile = {
    name: "question.png",
    mimeType: "image/png",
    buffer: await makePicture("#dc2626"),
  };
  const backFile = {
    name: "answer.png",
    mimeType: "image/png",
    buffer: await makePicture("#16a34a", true),
  };
  await page
    .getByRole("button", { name: "Add first question", exact: true })
    .click();
  for (const [index, type] of [
    "Multiple choice",
    "True or false",
    "Fill in the blank",
  ].entries()) {
    if (index) {
      await page
        .getByRole("button", { name: "Add blank question", exact: true })
        .click();
      await page
        .getByRole("combobox", { name: "Question type", exact: true })
        .click();
      await page.getByRole("option", { name: type, exact: true }).click();
    }
    await page
      .getByLabel("Your question", { exact: true })
      .fill(`Picture question ${index + 1}`);
    if (index === 0) {
      for (const [i, option] of ["Cat", "Dog", "Bird", "Fish"].entries())
        await page
          .getByRole("textbox", { name: `Option ${i + 1}`, exact: true })
          .fill(option);
      await page
        .getByRole("checkbox", { name: "Mark option 1 correct" })
        .check();
    } else if (index === 1) {
      await page.getByRole("radio", { name: "Mark option 1 correct" }).check();
    } else {
      await page.getByLabel("Accepted answers (one per line)").fill("Cat");
    }
    if (!index) {
      await page.getByLabel("Question picture", { exact: true }).setInputFiles({
        name: "invalid.png",
        mimeType: "image/png",
        buffer: Buffer.from("not an image"),
      });
      await expect(page.getByRole("alert")).toContainText(
        "could not be opened",
      );
    }
    await page
      .getByLabel("Question picture", { exact: true })
      .setInputFiles(frontFile);
    await expect(
      page.getByRole("img", { name: "Question picture preview", exact: true }),
    ).toBeVisible();
    await page
      .getByLabel("Answer picture", { exact: true })
      .setInputFiles(backFile);
    await expect(
      page.getByRole("img", { name: "Answer picture preview", exact: true }),
    ).toBeVisible();
    if (!index) {
      for (const [width, height] of sizes) {
        await page.setViewportSize({ width, height });
        await checkImageLayout(
          page.getByRole("img", {
            name: "Question picture preview",
            exact: true,
          }),
          ".card-image-upload",
        );
        await checkImageLayout(
          page.getByRole("img", {
            name: "Answer picture preview",
            exact: true,
          }),
          ".card-image-upload",
        );
      }
      await page.setViewportSize({ width: 390, height: 844 });
    }
  }
  await page.getByRole("button", { name: "Preview", exact: true }).click();
  const front = page.locator('.flashcard-front[aria-hidden="false"]');
  const back = page.locator('.flashcard-back[aria-hidden="false"]');
  for (let index = 0; index < 3; index++) {
    await expect(front).toContainText(`Picture question ${index + 1}`);
    const picture = front.getByRole("img", {
      name: "Question picture",
      exact: true,
    });
    await expect(picture).toBeVisible();
    await expect
      .poll(() => picture.evaluate((img: HTMLImageElement) => img.naturalWidth))
      .toBe(1600);
    await expect(
      page.getByRole("img", { name: "Answer picture", exact: true }),
    ).toHaveCount(0);
    if (!index) {
      for (const [width, height] of sizes) {
        await page.setViewportSize({ width, height });
        await checkImageLayout(picture, ".flashcard-face");
      }
      await page.setViewportSize({ width: 390, height: 844 });
    }
    await front
      .getByRole("button", { name: "Reveal answer", exact: true })
      .click();
    await expect(
      back.getByRole("img", { name: "Answer picture", exact: true }),
    ).toBeVisible();
    if (!index) {
      for (const [width, height] of sizes) {
        await page.setViewportSize({ width, height });
        await checkImageLayout(
          back.getByRole("img", { name: "Answer picture", exact: true }),
          ".flashcard-face",
        );
      }
      await page.setViewportSize({ width: 390, height: 844 });
    }
    await expect(
      page.getByRole("img", { name: "Question picture", exact: true }),
    ).toHaveCount(0);
    if (index < 2)
      await page
        .getByRole("button", { name: "Next card", exact: true })
        .click();
  }
  await page
    .getByRole("button", { name: "Back to my quizzes", exact: true })
    .click();
  await page.getByRole("button", { name: "Edit quiz", exact: true }).click();
  await expect(
    page.getByRole("img", { name: "Question picture preview", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Remove question picture", exact: true })
    .click();
  await expect(
    page.getByRole("img", { name: "Question picture preview", exact: true }),
  ).toHaveCount(0);
  await page
    .getByLabel("Question picture", { exact: true })
    .setInputFiles(backFile);
  const replacement = page.getByRole("img", {
    name: "Question picture preview",
    exact: true,
  });
  await expect(replacement).toBeVisible();
  const replacementSrc = await replacement.getAttribute("src");
  await page
    .getByRole("button", { name: "Remove answer picture", exact: true })
    .click();
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await page.reload();
  await page
    .getByRole("button", { name: "Open navigation", exact: true })
    .click();
  await page.getByRole("button", { name: "My quizzes", exact: true }).click();
  await page.getByRole("button", { name: "Edit quiz", exact: true }).click();
  await expect(
    page.getByRole("img", { name: "Question picture preview", exact: true }),
  ).toHaveAttribute("src", replacementSrc!);
  await expect(
    page.getByRole("img", { name: "Answer picture preview", exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Next question", exact: true })
    .click();
  await expect(
    page.getByRole("img", { name: "Question picture preview", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("img", { name: "Answer picture preview", exact: true }),
  ).toBeVisible();
});

test("mixed flashcard deck saves multiple correct choices and previews every type", async ({
  page,
}) => {
  await page.goto("/");
  await createQuiz(page);
  await expect(
    page.getByRole("heading", { name: /Flashcard creation studio/ }),
  ).toBeVisible();
  await expect(page.getByRole("combobox", { name: /difficulty/i })).toHaveCount(
    0,
  );
  await page.getByLabel("Quiz title", { exact: true }).fill("Mixed flashcards");
  await page
    .getByRole("button", { name: "Add first question", exact: true })
    .click();
  await page
    .getByLabel("Your question", { exact: true })
    .fill("Which are planets?");
  for (const [i, value] of ["Mars", "Moon", "Venus", "Sun"].entries())
    await page
      .getByRole("textbox", { name: `Option ${i + 1}`, exact: true })
      .fill(value);
  await page.getByRole("checkbox", { name: "Mark option 1 correct" }).check();
  await page.getByRole("checkbox", { name: "Mark option 3 correct" }).check();
  await page
    .getByRole("textbox", { name: "Option 3", exact: true })
    .fill("Earth");
  await page
    .getByRole("button", { name: "Remove option 2", exact: true })
    .click();
  await expect(
    page.getByRole("checkbox", { name: "Mark option 2 correct" }),
  ).toBeChecked();
  await page
    .getByRole("button", { name: "Add blank question", exact: true })
    .click();
  await page
    .getByRole("combobox", { name: "Question type", exact: true })
    .click();
  await expect(page.getByRole("option")).toHaveText([
    "Multiple choice",
    "True or false",
    "Fill in the blank",
  ]);
  await page
    .getByRole("option", { name: "True or false", exact: true })
    .click();
  await page
    .getByLabel("Your question", { exact: true })
    .fill("Earth is a planet");
  await page.getByRole("radio", { name: "Mark option 1 correct" }).check();
  await page
    .getByRole("button", { name: "Add blank question", exact: true })
    .click();
  await page
    .getByRole("combobox", { name: "Question type", exact: true })
    .click();
  await page
    .getByRole("option", { name: "Fill in the blank", exact: true })
    .click();
  await page
    .getByLabel("Your question", { exact: true })
    .fill("Our star is ___");
  await page.getByLabel("Accepted answers (one per line)").fill("Sun");
  await page.getByRole("button", { name: "Preview", exact: true }).click();
  const front = page.locator('.flashcard-front[aria-hidden="false"]');
  const back = page.locator('.flashcard-back[aria-hidden="false"]');
  await expect(front).toContainText("Mars");
  await expect(front).toContainText("Earth");
  await front.locator(".flashcard-text").tap();
  await expect(front).toBeVisible();
  await page.locator(".flashcard").press("Enter");
  await page.locator(".flashcard").press("Space");
  await expect(front).toBeVisible();
  await expect(back).toHaveCount(0);
  const mars = front.getByRole("button", { name: "A. Mars", exact: true });
  const earth = front.getByRole("button", { name: "B. Earth", exact: true });
  await mars.tap();
  await expect(mars).toHaveAttribute("aria-pressed", "true");
  await expect(front).toBeVisible();
  await earth.tap();
  await expect(earth).toHaveAttribute("aria-pressed", "true");
  await expect(mars).toHaveAttribute("aria-pressed", "true");
  await mars.tap();
  await expect(mars).toHaveAttribute("aria-pressed", "false");
  await mars.focus();
  await page.keyboard.press("Space");
  await expect(mars).toHaveAttribute("aria-pressed", "true");
  await front.getByRole("button", { name: "Reveal answer", exact: true }).tap();
  await expect(back).toContainText("Mars, Earth");
  await back.getByRole("button", { name: "Show question", exact: true }).tap();
  await expect(mars).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Next card", exact: true }).click();
  await expect(front).toContainText("True");
  await expect(front).toContainText("False");
  const trueChoice = front.getByRole("button", {
    name: "A. True",
    exact: true,
  });
  const falseChoice = front.getByRole("button", {
    name: "B. False",
    exact: true,
  });
  await trueChoice.tap();
  await falseChoice.tap();
  await expect(falseChoice).toHaveAttribute("aria-pressed", "true");
  await expect(trueChoice).toHaveAttribute("aria-pressed", "false");
  await front.getByRole("button", { name: "Reveal answer", exact: true }).tap();
  await expect(back).toContainText("True");
  await page.getByRole("button", { name: "Next card", exact: true }).click();
  await expect(front).toContainText("Our star is ___");
  const typedAnswer = front.getByRole("textbox", {
    name: "Your answer",
    exact: true,
  });
  await typedAnswer.fill("My guess");
  await typedAnswer.press("ArrowLeft");
  await typedAnswer.press("ArrowRight");
  await typedAnswer.press("Enter");
  await expect(typedAnswer).toHaveValue("My guess");
  await expect(front).toContainText("Our star is ___");
  await expect(back).toHaveCount(0);
  await front.getByRole("button", { name: "Reveal answer", exact: true }).tap();
  await expect(back).toContainText("Your answer: My guess");
  await expect(back.locator("mark")).toHaveCount(0);
  await expect(back).toContainText("Sun");
  await back.getByRole("button", { name: "Show question", exact: true }).tap();
  await expect(typedAnswer).toHaveValue("My guess");
  await page.getByRole("button", { name: "BAD", exact: true }).tap();
  await page.getByRole("button", { name: "Previous", exact: true }).tap();
  await page.getByRole("button", { name: "Next card", exact: true }).tap();
  await expect(typedAnswer).toHaveValue("My guess");
  await typedAnswer.fill("Sun");
  await front.getByRole("button", { name: "Reveal answer", exact: true }).tap();
  await expect(back).toContainText("Your answer: Sun");
  await expect(back.locator(".flashcard-submitted-answer mark")).toHaveText([
    "Sun",
  ]);
  await expect(back.locator(".flashcard-text mark")).toHaveText(["Sun"]);
  await back.getByRole("button", { name: "Show question", exact: true }).tap();
  await typedAnswer.fill("online sun");
  await expect(back).toHaveCount(0);
  await front.getByRole("button", { name: "Reveal answer", exact: true }).tap();
  await expect(back.locator(".flashcard-submitted-answer mark")).toHaveText([
    "sun",
  ]);
  await expect(back.locator(".flashcard-text mark")).toHaveText(["Sun"]);
  await expect(back).toContainText("Your answer: online sun");
  await page.keyboard.press("Escape");
  await page.reload();
  await page
    .getByRole("button", { name: "Open navigation", exact: true })
    .click();
  await page.getByRole("button", { name: "My quizzes", exact: true }).click();
  await page.getByRole("button", { name: "Edit quiz", exact: true }).click();
  await expect(
    page.getByRole("checkbox", { name: "Mark option 1 correct" }),
  ).toBeChecked();
  await expect(
    page.getByRole("checkbox", { name: "Mark option 2 correct" }),
  ).toBeChecked();
});

test("questions support bold and italic formatting, shortcuts, and saved flashcard display", async ({
  page,
}) => {
  await page.goto("/");
  await createQuiz(page);
  await page
    .getByRole("button", { name: "Add first question", exact: true })
    .click();
  const field = page.getByRole("textbox", {
    name: "Your question",
    exact: true,
  });
  const selectText = async (start: number, end: number) => {
    await field.evaluate(
      (element, { start, end }) => {
        element.focus();
        const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
        const range = document.createRange();
        let offset = 0;
        let hasStart = false;
        while (walker.nextNode()) {
          const node = walker.currentNode;
          const length = node.textContent!.length;
          if (!hasStart && start <= offset + length) {
            range.setStart(node, start - offset);
            hasStart = true;
          }
          if (end <= offset + length) {
            range.setEnd(node, end - offset);
            break;
          }
          offset += length;
        }
        const selection = window.getSelection()!;
        selection.removeAllRanges();
        selection.addRange(range);
      },
      { start, end },
    );
  };
  await field.fill("Bruce Wayne is Batman.");
  await selectText(0, 5);
  await page.getByRole("button", { name: "Bold", exact: true }).tap();
  await expect(field.locator("b, strong")).toHaveText("Bruce");
  await selectText(6, 11);
  await page.getByRole("button", { name: "Italic", exact: true }).tap();
  await expect(field.locator("i, em")).toHaveText("Wayne");
  await selectText(0, 5);
  await field.press("Control+b");
  await expect(field.locator("b, strong")).toHaveCount(0);
  await selectText(0, 5);
  await field.press("Control+b");
  await expect(field.locator("b, strong")).toHaveText("Bruce");
  await expect(field.locator("b, strong")).toHaveText("Bruce");
  await expect(field.locator("i, em")).toHaveText("Wayne");
  await page.getByRole("button", { name: "Preview", exact: true }).tap();
  const prompt = page.locator(
    '.flashcard-front[aria-hidden="false"] .flashcard-text',
  );
  await expect(prompt).toHaveText("Bruce Wayne is Batman.");
  await expect(prompt.locator("strong")).toHaveText("Bruce");
  await expect(prompt.locator("em")).toHaveText("Wayne");
  await expect(prompt.locator("em")).toHaveCSS("font-style", "italic");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Edit quiz", exact: true }).tap();
  await expect(field).toHaveText("Bruce Wayne is Batman.");
  await expect(field.locator("b, strong")).toHaveText("Bruce");
  await expect(field.locator("i, em")).toHaveText("Wayne");
  for (const type of ["True or false", "Fill in the blank"]) {
    await page
      .getByRole("combobox", { name: "Question type", exact: true })
      .click();
    await page.getByRole("option", { name: type, exact: true }).click();
    await expect(field.locator("b, strong")).toHaveText("Bruce");
    await expect(field.locator("i, em")).toHaveText("Wayne");
  }
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - innerWidth,
    ),
  ).toBeLessThanOrEqual(1);
});

test("bold and italic buttons stay on for new typing until toggled off", async ({
  page,
}) => {
  await page.goto("/");
  await createQuiz(page);
  await page
    .getByRole("button", { name: "Add first question", exact: true })
    .click();
  const field = page.getByRole("textbox", {
    name: "Your question",
    exact: true,
  });
  const bold = page.getByRole("button", { name: "Bold", exact: true });
  const italic = page.getByRole("button", { name: "Italic", exact: true });
  await bold.tap();
  await expect(bold).toHaveAttribute("aria-pressed", "true");
  await field.pressSequentially("Bruce");
  await expect(field.locator("b, strong")).toHaveText("Bruce");
  await bold.tap();
  await expect(bold).toHaveAttribute("aria-pressed", "false");
  await field.pressSequentially(" Wayne");
  await italic.tap();
  await expect(italic).toHaveAttribute("aria-pressed", "true");
  await field.pressSequentially(" is Batman");
  await expect(field.locator("i, em")).toContainText("is Batman");
  await italic.tap();
  await expect(italic).toHaveAttribute("aria-pressed", "false");
  await field.pressSequentially(".");
  await expect(field).toHaveText("Bruce Wayne is Batman.");
  await expect(field.locator("b, strong")).toHaveText("Bruce");
  await expect(field.locator("i, em")).toHaveText("is Batman");
  await page.getByRole("button", { name: "Preview", exact: true }).tap();
  const prompt = page.locator(
    '.flashcard-front[aria-hidden="false"] .flashcard-text',
  );
  await expect(prompt).toHaveText("Bruce Wayne is Batman.");
  await expect(prompt.locator("strong")).toHaveText("Bruce");
  await expect(prompt.locator("em")).toHaveText("is Batman");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Edit quiz", exact: true }).tap();
  await expect(field).toHaveText("Bruce Wayne is Batman.");
  await expect(field.locator("strong")).toHaveText("Bruce");
  await field.press("Control+End");
  await field.press("Enter");
  await field.pressSequentially("Next line");
  await expect(page.locator(".question-format-preview")).toHaveCount(0);
  await page.getByRole("button", { name: "Preview", exact: true }).tap();
  await expect
    .poll(() => prompt.textContent())
    .toBe("Bruce Wayne is Batman.\nNext line");
});

test("clicking Bold or Italic twice before typing returns to normal text", async ({
  page,
}) => {
  await page.goto("/");
  await createQuiz(page);
  await page
    .getByRole("button", { name: "Add first question", exact: true })
    .click();
  const field = page.getByRole("textbox", {
    name: "Your question",
    exact: true,
  });
  const bold = page.getByRole("button", { name: "Bold", exact: true });
  const italic = page.getByRole("button", { name: "Italic", exact: true });
  await bold.tap();
  await expect(bold).toHaveAttribute("aria-pressed", "true");
  await bold.tap();
  await expect(bold).toHaveAttribute("aria-pressed", "false");
  await field.pressSequentially("Normal");
  await expect(field.locator("b, strong")).toHaveCount(0);
  await field.press("Control+a");
  await field.press("Backspace");
  await italic.tap();
  await expect(italic).toHaveAttribute("aria-pressed", "true");
  await italic.tap();
  await expect(italic).toHaveAttribute("aria-pressed", "false");
  await field.pressSequentially("Plain");
  await expect(field.locator("i, em, b, strong")).toHaveCount(0);
  await bold.click();
  await expect(bold).toHaveAttribute("aria-pressed", "true");
  await bold.click();
  await expect(bold).toHaveAttribute("aria-pressed", "false");
  await field.pressSequentially(" text");
  await expect(field.locator("b, strong")).toHaveCount(0);
  await page.getByRole("button", { name: "Preview", exact: true }).tap();
  const prompt = page.locator(
    '.flashcard-front[aria-hidden="false"] .flashcard-text',
  );
  await expect(prompt).toHaveText("Plain text");
  await expect(prompt.locator("strong, em")).toHaveCount(0);
});

test("Bold and Italic are mutually exclusive for typing and mixed selections", async ({
  page,
}) => {
  await page.goto("/");
  await createQuiz(page);
  await page
    .getByRole("button", { name: "Add first question", exact: true })
    .click();
  const field = page.getByRole("textbox", {
    name: "Your question",
    exact: true,
  });
  const bold = page.getByRole("button", { name: "Bold", exact: true });
  const italic = page.getByRole("button", { name: "Italic", exact: true });
  await bold.tap();
  await italic.tap();
  await expect(bold).toHaveAttribute("aria-pressed", "false");
  await expect(italic).toHaveAttribute("aria-pressed", "true");
  await field.pressSequentially("Italic");
  await bold.tap();
  await expect(bold).toHaveAttribute("aria-pressed", "true");
  await expect(italic).toHaveAttribute("aria-pressed", "false");
  await field.pressSequentially(" Bold");
  await expect(field.locator("i, em")).toHaveText("Italic");
  await expect(field.locator("b, strong")).toContainText("Bold");
  await field.press("Control+a");
  await italic.tap();
  await expect(bold).toHaveAttribute("aria-pressed", "false");
  await expect(italic).toHaveAttribute("aria-pressed", "true");
  await expect(field.locator("b, strong")).toHaveCount(0);
  await field.press("Control+b");
  await expect(bold).toHaveAttribute("aria-pressed", "true");
  await expect(italic).toHaveAttribute("aria-pressed", "false");
  await expect(field.locator("i, em")).toHaveCount(0);
  await page.getByRole("button", { name: "Preview", exact: true }).tap();
  const prompt = page.locator(
    '.flashcard-front[aria-hidden="false"] .flashcard-text',
  );
  await expect(prompt).toHaveText("Italic Bold");
  await expect(prompt.locator("strong")).toHaveText("Italic Bold");
  await expect(prompt.locator("em")).toHaveCount(0);
});

test("page labels stay unselected, clicking has no focus outline, and editor Select All stays local", async ({
  page,
}) => {
  await page.goto("/");
  await createQuiz(page);
  await page
    .getByRole("button", { name: "Add first question", exact: true })
    .click();
  const field = page.getByRole("textbox", {
    name: "Your question",
    exact: true,
  });
  const bold = page.getByRole("button", { name: "Bold", exact: true });
  await field.click();
  await field.press("Control+a");
  expect(await page.evaluate(() => window.getSelection()?.toString())).toBe("");
  await expect(page.locator("body")).toHaveCSS("user-select", "none");
  await expect(field).toHaveCSS("user-select", "text");
  await expect(field).toHaveCSS("outline-style", "none");
  await expect(field).toHaveCSS("box-shadow", "none");
  await field.fill("Only this question");
  await field.press("Control+a");
  expect(await page.evaluate(() => window.getSelection()?.toString())).toBe(
    "Only this question",
  );
  await bold.tap();
  await expect(field.locator("b, strong")).toHaveText("Only this question");
  await expect(bold).toHaveCSS("outline-style", "none");
  await expect(field).toHaveCSS("box-shadow", "none");
  await bold.focus();
  await page.keyboard.press("Tab");
  const italic = page.getByRole("button", { name: "Italic", exact: true });
  await expect(italic).toBeFocused();
  await expect(italic).toHaveCSS("outline-style", "solid");
});
