import { test } from "node:test";
import assert from "node:assert/strict";
import { matchesAnswer, correctIndices } from "../src/lib/questions.ts";

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
