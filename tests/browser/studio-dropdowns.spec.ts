import { test, expect } from "@playwright/test";

test("editor dropdowns fit dark mobile screens and save their selections", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 844 });
  await page.addInitScript(() =>
    localStorage.setItem("quizcraft-theme", "dark"),
  );
  await page.request.post("/api/auth/register", {
    data: {
      email: `menus-${Date.now()}@example.test`,
      name: "Dropdown learner",
      password: "dropdown-password",
    },
  });
  const { id } = await (
    await page.request.post("/api/quizzes", { data: {} })
  ).json();
  const draft = await (await page.request.get("/api/quizzes/" + id)).json();
  await page.request.put("/api/quizzes/" + id, {
    data: {
      ...draft,
      title: "Dropdown practice",
      category: "Anatomy",
      questions: [
        {
          type: "multiple",
          prompt: "Practice question",
          options: ["Yes", "No"],
          accepted: ["Yes"],
          correctOption: 0,
          points: 10,
        },
      ],
    },
  });
  await page.goto("/");
  await page
    .getByRole("button", { name: "Open navigation", exact: true })
    .click();
  await page.getByRole("button", { name: "My quizzes", exact: true }).click();
  await page.getByRole("button", { name: "Edit quiz", exact: true }).click();
  async function choose(label: string, option: string) {
    await page.getByRole("combobox", { name: label, exact: true }).click();
    await expect(page.getByRole("listbox")).toBeInViewport({ ratio: 1 });
    await page.getByRole("option", { name: option, exact: true }).click();
    await expect(
      page.getByRole("combobox", { name: label, exact: true }),
    ).toHaveText(option);
  }
  await choose("Quiz difficulty", "Advanced");
  await choose("Question type", "True or false");
  await page
    .getByRole("radio", { name: "Mark option 1 correct", exact: true })
    .check();
  await page.getByRole("button", { name: /Settings & sharing/ }).click();
  await choose("Visibility", "Private - only you");
  await choose("Question layout", "All questions");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - innerWidth,
    ),
  ).toBeLessThanOrEqual(1);
  await page.getByRole("button", { name: /Quiz & questions/ }).click();
  await page
    .getByRole("button", { name: "Save draft", exact: true })
    .first()
    .click();
  await expect(
    page.getByRole("heading", { name: "Made by you", exact: true }),
  ).toBeVisible();
  const saved = await (await page.request.get("/api/quizzes/" + id)).json();
  expect(saved.difficulty).toBe("Advanced");
  expect(saved.visibility).toBe("private");
  expect(saved.settings.layout).toBe("all");
  expect(saved.questions[0].type).toBe("boolean");
  expect(saved.questions[0].accepted).toEqual(["True"]);
});

test("category trash icon can cancel or remove the label without deleting quizzes", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 844 });
  await page.request.post("/api/auth/register", {
    data: {
      email: `delete-category-${Date.now()}@example.test`,
      name: "Category learner",
      password: "category-password",
    },
  });
  const ids: string[] = [];
  for (const title of ["Anatomy one", "Anatomy two"]) {
    const { id } = await (
      await page.request.post("/api/quizzes", { data: {} })
    ).json();
    ids.push(id);
    const draft = await (await page.request.get("/api/quizzes/" + id)).json();
    await page.request.put("/api/quizzes/" + id, {
      data: {
        ...draft,
        title,
        category: "Anatomy",
        status: "published",
        questions: [
          {
            type: "blank",
            prompt: "Study question",
            options: [],
            accepted: ["Answer"],
            points: 10,
          },
        ],
      },
    });
  }
  await page.goto("/");
  await page
    .getByRole("button", { name: "Open navigation", exact: true })
    .click();
  await page.getByRole("button", { name: "My quizzes", exact: true }).click();
  await page
    .getByRole("button", { name: "Edit quiz", exact: true })
    .first()
    .click();
  await page
    .getByRole("button", { name: "Delete category", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Delete category?" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(
    page.getByRole("combobox", { name: "Quiz category" }),
  ).toHaveText("Anatomy");
  await page
    .getByRole("button", { name: "Delete category", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Delete category", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.getByRole("combobox", { name: "Quiz category" }),
  ).toHaveText("Uncategorized");
  await expect(
    page.getByRole("button", { name: "Delete category", exact: true }),
  ).toBeDisabled();
  await page.getByRole("combobox", { name: "Quiz category" }).click();
  await expect(
    page.getByRole("option", { name: "Anatomy", exact: true }),
  ).toHaveCount(0);
  await page.keyboard.press("Escape");
  for (const id of ids) {
    const kept = await (await page.request.get("/api/quizzes/" + id)).json();
    expect(kept.category).toBe("Uncategorized");
    expect(kept.status).toBe("published");
    expect(kept.questions).toHaveLength(1);
  }
});
