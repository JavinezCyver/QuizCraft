import { test } from "node:test";
import assert from "node:assert/strict";
import { highlightAnswer } from "../src/lib/answer-highlight.ts";
const highlighted = (answer, accepted) =>
  highlightAnswer(answer, accepted)
    .filter((part) => part.matched)
    .map((part) => part.text);

test("highlights matching words in partial answers, ignoring capitalization", () => {
  assert.deepEqual(highlighted("bruce", ["Bruce Wayne"]), ["bruce"]);
  assert.deepEqual(highlighted("online BRUCE", ["Bruce Wayne"]), ["BRUCE"]);
  assert.deepEqual(highlighted("bruce wayne", ["Bruce Wayne"]), [
    "bruce",
    "wayne",
  ]);
});
test("unrelated answers and word fragments stay unhighlighted", () => {
  assert.deepEqual(highlighted("Clark Kent", ["Bruce Wayne"]), []);
  assert.deepEqual(highlighted("brucely", ["Bruce Wayne"]), []);
  assert.deepEqual(highlighted("the ocean", ["The Sun"]), []);
});
test("preserves typed punctuation, whitespace, and text, and supports alternatives", () => {
  const answer = "  BRUCE, Wayne! <hello>";
  assert.equal(
    highlightAnswer(answer, ["Bruce Wayne"])
      .map((part) => part.text)
      .join(""),
    answer,
  );
  assert.deepEqual(highlighted("CO2", ["Carbon dioxide", "CO2"]), ["CO2"]);
  assert.deepEqual(highlighted("the sun!", ["The Sun"]), ["the", "sun"]);
  assert.deepEqual(highlighted("", ["Sun"]), []);
  assert.deepEqual(highlighted("Bruce", []), []);
});

test("matching words can also be highlighted in the creator's accepted answer", () => {
  assert.deepEqual(highlighted("Bruce Wayne", ["online bruce"]), ["Bruce"]);
  assert.deepEqual(highlighted("Bruce Wayne", ["Bruce Wayne"]), [
    "Bruce",
    "Wayne",
  ]);
  assert.deepEqual(highlighted("Bruce Wayne", ["Clark Kent"]), []);
});
