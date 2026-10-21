import { createQuiz } from "./navigation";
import { test, expect, type Locator } from "@playwright/test";

test.use({ hasTouch: true, viewport: { width: 390, height: 844 } });

test("the bottom New Question button adds a blank question and preserves the previous one", async ({
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
  await field.fill("First question stays saved");
  const type = page.getByRole("combobox", {
    name: "Question type",
    exact: true,
  });
  const answers = page.getByLabel("Accepted answers (one per line)");
  await expect(type).toHaveText("Fill in the blank");
  await answers.fill("First answer");
  await page.getByRole("button", { name: "New Question", exact: true }).tap();
  await expect(
    page.getByRole("heading", { name: "Question 2", exact: true }),
  ).toBeInViewport();
  await expect(field).toHaveText("");
  await expect(type).toHaveText("Fill in the blank");
  await expect(answers).toHaveValue("");
  await field.fill("Second question stays saved");
  await page
    .getByRole("button", { name: "Previous question", exact: true })
    .click();
  await expect(field).toHaveText("First question stays saved");
  await expect(answers).toHaveValue("First answer");
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await page.reload();
  await page
    .getByRole("button", { name: "Open navigation", exact: true })
    .click();
  await page.getByRole("button", { name: "My quizzes", exact: true }).click();
  await page.getByRole("button", { name: "Edit quiz", exact: true }).click();
  await expect(field).toHaveText("First question stays saved");
  await page
    .getByRole("button", { name: "Next question", exact: true })
    .click();
  await expect(field).toHaveText("Second question stays saved");
  await expect(type).toHaveText("Fill in the blank");
  await page
    .getByRole("button", { name: "Add blank question", exact: true })
    .click();
  await expect(type).toHaveText("Fill in the blank");
});

test("categories are created from the dropdown and saved with the draft", async ({
  page,
}) => {
  await page.goto("/");
  await createQuiz(page);
  const category = page.getByRole("combobox", { name: "Quiz category" });
  const original = await category.textContent();
  await expect(page.getByLabel("New category", { exact: true })).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Add category", exact: true }),
  ).toHaveCount(0);
  await category.click();
  await page
    .getByRole("option", { name: "+ Add new category", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Add new category",
    exact: true,
  });
  await expect(dialog.getByLabel("Category name")).toBeFocused();
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(category).toHaveText(original!);
  await category.click();
  await page
    .getByRole("option", { name: "+ Add new category", exact: true })
    .click();
  await dialog
    .getByRole("button", { name: "Create category", exact: true })
    .click();
  await expect(dialog.getByRole("alert")).toHaveText(
    "Enter a category from 1 to 60 characters.",
  );
  await dialog.getByLabel("Category name").fill("  Clinical   Pharmacology  ");
  await dialog.getByLabel("Category name").press("Enter");
  await expect(dialog).toHaveCount(0);
  await expect(category).toHaveText("Clinical Pharmacology");
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await page.reload();
  await page
    .getByRole("button", { name: "Open navigation", exact: true })
    .click();
  await page.getByRole("button", { name: "My quizzes", exact: true }).click();
  await page.getByRole("button", { name: "Edit quiz", exact: true }).click();
  await expect(category).toHaveText("Clinical Pharmacology");
});

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
  await page.getByLabel("Question picture", { exact: true }).setInputFiles({
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
    }
    await page
      .getByRole("combobox", { name: "Question type", exact: true })
      .click();
    await page.getByRole("option", { name: type, exact: true }).click();
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
  await page
    .getByRole("combobox", { name: "Question type", exact: true })
    .click();
  await page
    .getByRole("option", { name: "Multiple choice", exact: true })
    .click();
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
  await expect(mars).toBeDisabled();
  await expect(front).toBeVisible();
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
  await expect(falseChoice).toBeDisabled();
  await expect(falseChoice).toHaveAttribute("aria-pressed", "false");
  await expect(trueChoice).toHaveAttribute("aria-pressed", "true");
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
  await expect(typedAnswer).toHaveValue("");
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

test("multiple choice automatically uses single or multiple selection from the marked answers", async ({
  page,
}) => {
  await page.goto("/");
  await createQuiz(page);
  await page
    .getByRole("button", { name: "Add first question", exact: true })
    .tap();
  await page
    .getByRole("textbox", { name: "Your question", exact: true })
    .fill("Choose the correct characters");
  await page
    .getByRole("combobox", { name: "Question type", exact: true })
    .click();
  await page
    .getByRole("option", { name: "Multiple choice", exact: true })
    .click();
  for (const [index, option] of [
    "sasuke",
    "kakashi",
    "naruto",
    "hakdog",
  ].entries()) {
    await page
      .getByRole("textbox", { name: `Option ${index + 1}`, exact: true })
      .fill(option);
  }
  await page
    .getByRole("checkbox", { name: "Mark option 1 correct", exact: true })
    .check();
  await page.getByRole("button", { name: "Preview", exact: true }).tap();
  const sasuke = page.getByRole("button", { name: "A. sasuke", exact: true });
  const kakashi = page.getByRole("button", { name: "B. kakashi", exact: true });
  const naruto = page.getByRole("button", { name: "C. naruto", exact: true });
  await sasuke.tap();
  await expect(sasuke).toBeDisabled();
  await page.getByRole("button", { name: "Start again", exact: true }).tap();
  await kakashi.tap();
  await expect(sasuke).toHaveAttribute("aria-pressed", "false");
  await expect(kakashi).toHaveAttribute("aria-pressed", "true");
  await expect(kakashi).toBeDisabled();
  await page.getByRole("button", { name: "Reveal answer", exact: true }).tap();
  await expect(
    page.locator('.flashcard-back[aria-hidden="false"] .flashcard-text'),
  ).toHaveText("sasuke");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Edit quiz", exact: true }).tap();
  await page
    .getByRole("checkbox", { name: "Mark option 3 correct", exact: true })
    .check();
  await page.getByRole("button", { name: "Preview", exact: true }).tap();
  await sasuke.tap();
  await naruto.tap();
  await expect(sasuke).toHaveAttribute("aria-pressed", "true");
  await expect(naruto).toHaveAttribute("aria-pressed", "true");
  await expect(sasuke).toBeDisabled();
  await expect(sasuke).toHaveAttribute("aria-pressed", "true");
  await expect(naruto).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Reveal answer", exact: true }).tap();
  await expect(
    page.locator('.flashcard-back[aria-hidden="false"] .flashcard-text'),
  ).toHaveText("sasuke, naruto");
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

test.describe("mobile formatting with the on-screen keyboard", () => {
  test.use({
    isMobile: true,
    hasTouch: true,
    viewport: { width: 390, height: 844 },
    userAgent:
      "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36",
  });

  for (const style of ["Bold", "Italic", "Underline"]) {
    test(`${style} survives tapping the field and returns to normal on a second tap`, async ({
      page,
    }) => {
      await page.goto("/");
      await createQuiz(page);
      await page
        .getByRole("button", { name: "Add first question", exact: true })
        .tap();
      const field = page.getByRole("textbox", {
        name: "Your question",
        exact: true,
      });
      const button = page.getByRole("button", { name: style, exact: true });
      const tag =
        style === "Bold" ? "b, strong" : style === "Italic" ? "i, em" : "u";
      await button.tap();
      await expect(button).toHaveAttribute("aria-pressed", "true");
      // Mobile users tap the field and type through an IME, without keydown events.
      await field.tap();
      await page.keyboard.insertText("Styled");
      await expect(field.locator(tag)).toHaveText("Styled");
      if (style === "Italic") {
        await expect(field.locator(tag)).toHaveCSS("font-style", "italic");
        expect(
          await field.evaluate(
            (element) => getComputedStyle(element).fontSynthesis,
          ),
        ).toContain("style");
      }
      await button.tap();
      await expect(button).toHaveAttribute("aria-pressed", "false");
      await page.keyboard.insertText(" plain");
      await expect(field).toHaveText("Styled plain");
      await expect(field.locator(tag)).toHaveText("Styled");
      await field.press("Control+a");
      await button.tap();
      await expect(field.locator(tag)).toHaveText("Styled plain");
      await button.tap();
      await expect(button).toHaveAttribute("aria-pressed", "false");
      await expect(field.locator(tag)).toHaveCount(0);
      await page.keyboard.insertText("Normal");
      await expect(field).toHaveText("Normal");
    });
  }
});

test("Underline toggles, shortcuts, and saved flashcards work on a narrow screen", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto("/");
  await createQuiz(page);
  await page
    .getByRole("button", { name: "Add first question", exact: true })
    .click();
  const field = page.getByRole("textbox", {
    name: "Your question",
    exact: true,
  });
  const underline = page.getByRole("button", {
    name: "Underline",
    exact: true,
  });
  const bold = page.getByRole("button", { name: "Bold", exact: true });
  const italic = page.getByRole("button", { name: "Italic", exact: true });
  await underline.tap();
  await expect(underline).toHaveAttribute("aria-pressed", "true");
  await underline.tap();
  await expect(underline).toHaveAttribute("aria-pressed", "false");
  await field.pressSequentially("Plain ");
  await expect(field.locator("u")).toHaveCount(0);
  await underline.tap();
  await field.pressSequentially("underlined");
  await expect(field.locator("u")).toHaveText("underlined");
  await field.press("Control+u");
  await expect(underline).toHaveAttribute("aria-pressed", "false");
  await field.pressSequentially(" text");
  await expect(field.locator("u")).toHaveText("underlined");
  await field.press("Control+a");
  await field.press("Control+u");
  await expect(field.locator("u")).toHaveText("Plain underlined text");
  await bold.tap();
  await expect(underline).toHaveAttribute("aria-pressed", "true");
  await expect(field.locator("u")).toHaveText("Plain underlined text");
  await italic.tap();
  await expect(bold).toHaveAttribute("aria-pressed", "true");
  await expect(italic).toHaveAttribute("aria-pressed", "true");
  await expect(underline).toHaveAttribute("aria-pressed", "true");
  await underline.tap();
  await expect(underline).toHaveAttribute("aria-pressed", "false");
  await expect(bold).toHaveAttribute("aria-pressed", "true");
  await expect(italic).toHaveAttribute("aria-pressed", "true");
  await field.press("Control+u");
  await expect(underline).toHaveAttribute("aria-pressed", "true");
  const bounds = await underline.boundingBox();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(320);
  await page.getByRole("button", { name: "Preview", exact: true }).tap();
  const prompt = page.locator(
    '.flashcard-front[aria-hidden="false"] .flashcard-text',
  );
  await expect(prompt).toHaveText("Plain underlined text");
  await expect(prompt.locator("u")).toHaveText("Plain underlined text");
  await expect(prompt.locator("strong")).toHaveText("Plain underlined text");
  await expect(prompt.locator("em")).toHaveText("Plain underlined text");
  await expect(prompt.locator("u")).toHaveCSS(
    "text-decoration-line",
    "underline",
  );
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Edit quiz", exact: true }).tap();
  await expect(field.locator("u")).toHaveText("Plain underlined text");
  await expect(field.locator("b, strong")).toHaveText("Plain underlined text");
  await expect(field.locator("i, em")).toHaveText("Plain underlined text");
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

test("formatting starts off for each new question and toggles only when chosen", async ({
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
  const buttons = ["Bold", "Italic", "Underline"].map((name) =>
    page.getByRole("button", { name, exact: true }),
  );
  await field.focus();
  for (const button of buttons)
    await expect(button).toHaveAttribute("aria-pressed", "false");
  await field.pressSequentially("Plain");
  await expect(field.locator("b, strong, i, em, u")).toHaveCount(0);
  for (const button of buttons) await button.tap();
  await field.pressSequentially(" formatted");
  for (const button of buttons)
    await expect(button).toHaveAttribute("aria-pressed", "true");
  await page
    .getByRole("button", { name: "Add blank question", exact: true })
    .tap();
  for (const button of buttons)
    await expect(button).toHaveAttribute("aria-pressed", "false");
  await field.focus();
  for (const button of buttons)
    await expect(button).toHaveAttribute("aria-pressed", "false");
  await field.pressSequentially("New plain question");
  await expect(field.locator("b, strong, i, em, u")).toHaveCount(0);
  await buttons[0].tap();
  await expect(buttons[0]).toHaveAttribute("aria-pressed", "true");
  await expect(buttons[1]).toHaveAttribute("aria-pressed", "false");
  await expect(buttons[2]).toHaveAttribute("aria-pressed", "false");
});

test("Bold and Italic combine independently for typing and mixed selections", async ({
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
  await expect(bold).toHaveAttribute("aria-pressed", "true");
  await expect(italic).toHaveAttribute("aria-pressed", "true");
  await field.pressSequentially("Both");
  await italic.tap();
  await expect(bold).toHaveAttribute("aria-pressed", "true");
  await expect(italic).toHaveAttribute("aria-pressed", "false");
  await field.pressSequentially(" Bold");
  await expect(field.locator("i, em")).toHaveText("Both");
  await expect(field.locator("b, strong")).toContainText("Bold");
  await field.press("Control+a");
  await italic.tap();
  await expect(bold).toHaveAttribute("aria-pressed", "true");
  await expect(italic).toHaveAttribute("aria-pressed", "true");
  await expect(field.locator("i, em")).toContainText("Both Bold");
  await field.press("Control+b");
  await expect(bold).toHaveAttribute("aria-pressed", "false");
  await expect(italic).toHaveAttribute("aria-pressed", "true");
  await expect(field.locator("b, strong")).toHaveCount(0);
  await page.getByRole("button", { name: "Preview", exact: true }).tap();
  const prompt = page.locator(
    '.flashcard-front[aria-hidden="false"] .flashcard-text',
  );
  await expect(prompt).toHaveText("Both Bold");
  await expect(prompt.locator("em")).toHaveText("Both Bold");
  await expect(prompt.locator("strong")).toHaveCount(0);
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
