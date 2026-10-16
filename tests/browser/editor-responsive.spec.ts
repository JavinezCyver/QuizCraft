import { test, expect, type Page } from "@playwright/test";
import { createQuiz } from "./navigation";

for (const width of [390, 1440]) {
  test(`color selection stays selected after clicking its checkmark and saving at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    await createQuiz(page);
    const group = page.getByRole("group", { name: "Color theme", exact: true });
    for (const theme of ["space", "world", "nature", "history", "movies"]) {
      const swatch = group.getByRole("button", {
        name: `${theme} theme`,
        exact: true,
      });
      await swatch.click();
      await expect(swatch).toHaveAttribute("aria-pressed", "true");
      await swatch.locator("svg").click();
      await expect(swatch).toHaveAttribute("aria-pressed", "true");
      await expect(group.locator('[aria-pressed="true"]')).toHaveCount(1);
    }
    await page.getByRole("button", { name: "Save draft", exact: true }).click();
    await page.reload();
    const navigation = page.getByRole("button", {
      name: "Open navigation",
      exact: true,
      includeHidden: true,
    });
    await navigation.waitFor({ state: "attached" });
    if (await navigation.isVisible()) await navigation.click();
    await page.getByRole("button", { name: "My quizzes", exact: true }).click();
    await page.getByRole("button", { name: "Edit quiz", exact: true }).click();
    await expect(
      group.getByRole("button", { name: "movies theme", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(
      group.getByRole("button", { name: "purple theme", exact: true }),
    ).toHaveAttribute("aria-pressed", "false");
  });
}

async function fits(page: Page) {
  const overflow = await page.evaluate(() => ({
    amount: document.documentElement.scrollWidth - innerWidth,
    elements: Array.from(document.querySelectorAll("main *"))
      .filter((el) => el.getBoundingClientRect().right > innerWidth + 1)
      .map((el) => ({
        tag: el.tagName,
        class: el.className,
        width: el.getBoundingClientRect().width,
      }))
      .slice(0, 15),
  }));
  expect(
    overflow.amount,
    JSON.stringify(overflow.elements),
  ).toBeLessThanOrEqual(1);
  for (const element of await page
    .locator(
      ".question-editor input, .question-editor textarea, .question-text-editor, .new-question-button",
    )
    .all()) {
    const box = await element.boundingBox();
    if (box) {
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(
        page.viewportSize()!.width + 1,
      );
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
]) {
  test.describe(`editor controls at ${width}x${height}`, () => {
    test.use({ viewport: { width, height }, hasTouch: width < 1024 });
    test("categories, formatting, optional fields and new questions fit", async ({
      page,
    }) => {
      await page.addInitScript(() =>
        localStorage.setItem("quizcraft-theme", "dark"),
      );
      await page.goto("/");
      await createQuiz(page);
      await page
        .getByRole("button", { name: "Add first question", exact: true })
        .click();
      await fits(page);
      const category = page.getByRole("combobox", {
        name: "Quiz category",
        exact: true,
      });
      await category.click();
      await page
        .getByRole("option", { name: "+ Add new category", exact: true })
        .click();
      const dialog = page.getByRole("dialog", {
        name: "Add new category",
        exact: true,
      });
      await expect(dialog).toBeInViewport({ ratio: 1 });
      await dialog.getByLabel("Category name").fill("Long category ".repeat(4));
      await dialog
        .getByRole("button", { name: "Create category", exact: true })
        .click();
      const field = page.getByRole("textbox", {
        name: "Your question",
        exact: true,
      });
      await field.focus();
      for (const name of ["Bold", "Italic", "Underline"]) {
        const button = page.getByRole("button", { name, exact: true });
        await expect(button).toHaveAttribute("aria-pressed", "false");
        await button.click();
      }
      await field.pressSequentially("Formatted question");
      await expect(field.locator("b, strong")).toHaveText("Formatted question");
      await expect(field.locator("i, em")).toHaveText("Formatted question");
      await expect(field.locator("u")).toHaveText("Formatted question");
      const type = page.getByRole("combobox", {
        name: "Question type",
        exact: true,
      });
      await expect(type).toHaveText("Fill in the blank");
      const accepted = page.getByLabel("Accepted answers (one per line)");
      await accepted.fill("LongAnswer".repeat(30));
      await expect(field).toHaveCSS(
        "font-size",
        await accepted.evaluate((el) => getComputedStyle(el).fontSize),
      );
      for (const name of [
        "Multiple choice",
        "True or false",
        "Fill in the blank",
      ]) {
        await type.click();
        await expect(page.getByRole("listbox")).toBeInViewport({ ratio: 1 });
        await page.getByRole("option", { name, exact: true }).click();
        await expect(type).toHaveText(name);
        await fits(page);
        if (name !== "Fill in the blank") {
          await page
            .getByRole("textbox", {
              name: "Answer explanation (optional)",
              exact: true,
            })
            .fill("LongExplanation".repeat(30));
          await fits(page);
        }
      }
      const button = page.getByRole("button", {
        name: "New Question",
        exact: true,
      });
      const panel = page.locator(".question-editor");
      if (width < 1024) {
        for (const control of [
          button,
          ...(await page
            .locator('.card-image-upload input[type="file"]')
            .all()),
        ]) {
          expect((await control.boundingBox())!.height).toBeGreaterThanOrEqual(
            44,
          );
        }
      }
      const bounds = await button.boundingBox();
      const panelBounds = await panel.boundingBox();
      const inset = await panel.evaluate(
        (el) =>
          parseFloat(getComputedStyle(el).paddingRight) +
          parseFloat(getComputedStyle(el).borderRightWidth),
      );
      expect(
        Math.abs(
          bounds!.x +
            bounds!.width -
            (panelBounds!.x + panelBounds!.width - inset),
        ),
      ).toBeLessThanOrEqual(1);
      await button.click();
      await expect(
        page.getByRole("heading", { name: "Question 2", exact: true }),
      ).toBeInViewport();
      await expect(field).toHaveText("");
      await expect(type).toHaveText("Fill in the blank");
      await fits(page);
    });
  });
}
