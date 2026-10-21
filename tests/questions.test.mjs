import { test } from "node:test";
import assert from "node:assert/strict";
import {
  matchesAnswer,
  correctIndices,
  matchesSelectedOptions,
  reorderOptions,
  optionIndices,
  hasDuplicateOptions,
  allowsMultipleSelections,
  hasCompleteAnswer,
  isStudyAnswerCorrect,
} from "../src/lib/questions.ts";

test("study correctness distinguishes completed errors, shuffled choices and self-assessed answers", () => {
  const card = {type:"multiple", options:["Mars", "Moon", "Earth"], accepted:["Mars", "Earth"], correctOptions:[0,2]};
  assert.equal(isStudyAnswerCorrect(card, [0]), false);
  assert.equal(isStudyAnswerCorrect(card, [0,1]), false);
  assert.equal(isStudyAnswerCorrect(card, [0,2]), true);
  assert.equal(isStudyAnswerCorrect(reorderOptions(card,[2,0,1]), [0,1]), true);
  assert.equal(isStudyAnswerCorrect({...card,type:"blank",accepted:["Sun"]}, [], "Moon"), false);
  assert.equal(isStudyAnswerCorrect({...card,type:"blank",accepted:["Sun"]}, [], " SUN "), true);
  assert.equal(isStudyAnswerCorrect({...card,type:"short",accepted:[]}, [], "My own response"), true);
  assert.equal(isStudyAnswerCorrect({...card,type:"short",accepted:[]}, [], "  "), false);
});

test("study completion requires every required choice and a nonempty typed answer", () => {
  const card = { type: "multiple", options: ["Mars", "Moon", "Earth"], accepted: ["Mars", "Earth"], correctOptions: [0, 2] };
  assert.equal(hasCompleteAnswer(card, []), false);
  assert.equal(hasCompleteAnswer(card, [0]), false);
  assert.equal(hasCompleteAnswer(card, [0, 0]), false);
  assert.equal(hasCompleteAnswer(card, [0, 99]), false);
  assert.equal(hasCompleteAnswer(card, [0, 2]), true);
  assert.equal(hasCompleteAnswer(card, [0, 1]), true);
  assert.equal(hasCompleteAnswer({ ...card, type: "boolean", correctOptions: [0] }, [1]), true);
  assert.equal(hasCompleteAnswer({ ...card, type: "blank" }, [], "   "), false);
  assert.equal(hasCompleteAnswer({ ...card, type: "blank" }, [], "Sun"), true);
});

test("multiple choice requires all correct answers and rejects extra choices", () => {
  const question = { type: "multiple", accepted: ["Mars", "Earth"] };
  assert.equal(matchesAnswer(question, '["Earth","Mars"]'), true);
  assert.equal(matchesAnswer(question, '["Mars"]'), false);
  assert.equal(matchesAnswer(question, '["Earth","Mars","Sun"]'), false);
  assert.equal(
    matchesAnswer({ ...question, accepted: ["Mars"] }, "Mars"),
    true,
  );
  assert.equal(matchesAnswer(question, "[1]"), false);
});
test("fill in the blank accepts alternatives and true or false stays single choice", () => {
  assert.equal(
    matchesAnswer(
      { type: "blank", accepted: ["Sun", "The Sun"] },
      "  THE   sun ",
    ),
    true,
  );
  assert.equal(
    matchesAnswer({ type: "boolean", accepted: ["True"] }, "False"),
    false,
  );
});
test("correct choices support legacy decks and retain indices for blank options", () => {
  assert.deepEqual(
    correctIndices({ options: ["A", "B", "C"], accepted: ["A", "C"] }),
    [0, 2],
  );
  assert.deepEqual(
    correctIndices({ options: ["", ""], accepted: [""], correctOption: 1 }),
    [1],
  );
  assert.deepEqual(
    correctIndices({
      options: ["", "", ""],
      accepted: ["", ""],
      correctOptions: [0, 2],
    }),
    [0, 2],
  );
});

test("legacy malformed correct-choice metadata cannot crash the editor", () => {
  for (const correctOptions of [{}, true, "not an array", null]) {
    assert.deepEqual(
      correctIndices({ options: ["A", "B"], accepted: ["B"], correctOptions }),
      [1],
    );
  }
});

test("choice identity survives shuffling even when labels are identical", () => {
  const question = {
    type: "multiple",
    options: ["Same", "Same", "Other"],
    accepted: ["Same"],
    correctOptions: [0],
  };
  const shuffled = reorderOptions(question, [1, 2, 0]);
  assert.deepEqual(shuffled.options, ["Same", "Other", "Same"]);
  assert.deepEqual(shuffled.correctOptions, [2]);
  assert.equal(matchesSelectedOptions(shuffled, [0]), false);
  assert.equal(matchesSelectedOptions(shuffled, [2]), true);
  assert.equal(matchesSelectedOptions(shuffled, [0, 2]), false);
  assert.deepEqual(
    optionIndices(question, ["Same", "Other", "Same"]),
    [0, 2, 1],
  );
});

test("duplicate choice validation ignores case and extra spaces", () => {
  assert.equal(
    hasDuplicateOptions({ options: ["Mars", "  MARS ", "Earth"] }),
    true,
  );
  assert.equal(
    hasDuplicateOptions({ options: ["Bruce  Wayne", "bruce wayne"] }),
    true,
  );
  assert.equal(
    hasDuplicateOptions({ options: ["Mars", "Earth", "", ""] }),
    false,
  );
});

test("multiple selection follows the number of marked correct choices", () => {
  const card = { type: "multiple", options: ["A", "B", "C"], accepted: ["A"] };
  assert.equal(allowsMultipleSelections(card), false);
  assert.equal(
    allowsMultipleSelections({ ...card, correctOptions: [0, 2] }),
    true,
  );
  assert.equal(
    allowsMultipleSelections({ ...card, accepted: ["A", "C"] }),
    true,
  );
  assert.equal(
    allowsMultipleSelections({
      ...card,
      type: "boolean",
      correctOptions: [0, 1],
    }),
    false,
  );
});
