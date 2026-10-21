import { test } from "node:test";
import assert from "node:assert/strict";
import { mergeQuizEdits } from "../src/lib/quiz-edit.ts";

const original = () => ({
  id: "quiz",
  title: "Original",
  description: "",
  category: "Science",
  status: "draft",
  settings: { showAnswers: true, randomQuestions: false },
  questions: [{ id: "one", prompt: "Original question" }],
});

test("different fields edited from the same snapshot retain both tabs' changes", () => {
  const base = original();
  const stored = { ...base, title: "First tab" };
  const edited = { ...base, description: "Second tab" };
  const saved = mergeQuizEdits(stored, edited, base);
  assert.equal(saved.title, "First tab");
  assert.equal(saved.description, "Second tab");
  assert.equal(stored.description, "");
});

test("conflicting edits to one field are rejected without replacing saved data", () => {
  const base = original();
  const stored = { ...base, title: "First tab" };
  assert.throws(
    () => mergeQuizEdits(stored, { ...base, title: "Second tab" }, base),
    /title changed in another tab/,
  );
  assert.equal(stored.title, "First tab");
  assert.equal(mergeQuizEdits(stored, stored, base).title, "First tab");
});

test("independent study settings merge and later edits can revert a saved value", () => {
  const base = original();
  const stored = {
    ...base,
    settings: { ...base.settings, showAnswers: false },
  };
  const edited = {
    ...base,
    settings: { ...base.settings, randomQuestions: true },
  };
  const saved = mergeQuizEdits(stored, edited, base);
  assert.deepEqual(saved.settings, {
    showAnswers: false,
    randomQuestions: true,
  });
  const reverted = {
    ...saved,
    settings: { ...saved.settings, randomQuestions: false },
  };
  assert.equal(
    mergeQuizEdits(saved, reverted, saved).settings.randomQuestions,
    false,
  );
});

test("concurrent question edits are protected as a unit", () => {
  const base = original();
  const stored = { ...base, questions: [{ id: "one", prompt: "First tab" }] };
  const edited = { ...base, questions: [{ id: "one", prompt: "Second tab" }] };
  assert.throws(
    () => mergeQuizEdits(stored, edited, base),
    /questions changed in another tab/,
  );
});

test("applying a save response preserves typing performed while the save was pending", () => {
  const base = original();
  const saved = {
    ...base,
    title: "Other tab's title",
    description: "Saved text",
  };
  const snapshot = { ...base, description: "Saved text" };
  const typing = {
    ...snapshot,
    description: "More typing",
    title: "New local title",
  };
  const rebased = mergeQuizEdits(saved, typing, snapshot, true);
  assert.equal(rebased.description, "More typing");
  assert.equal(rebased.title, "New local title");
});
