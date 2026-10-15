import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseQuestionText,
  plainQuestionText,
} from "../src/lib/question-format.ts";

test("bold and italic formatting preserves selected text", () => {
  assert.deepEqual(parseQuestionText("**Bruce** _Wayne_"), [
    { type: "bold", children: [{ type: "text", text: "Bruce" }] },
    { type: "text", text: " " },
    { type: "italic", children: [{ type: "text", text: "Wayne" }] },
  ]);
});
test("formatting combines and preserves punctuation and line breaks", () => {
  assert.deepEqual(parseQuestionText("**_Bruce_**\nWayne"), [
    {
      type: "bold",
      children: [
        { type: "italic", children: [{ type: "text", text: "Bruce" }] },
      ],
    },
    { type: "text", text: "\nWayne" },
  ]);
  assert.equal(plainQuestionText("**Bruce** _Wayne_!"), "Bruce Wayne!");
});
test("plain text, underscores within words, and incomplete formatting stay literal", () => {
  assert.equal(
    plainQuestionText("fill_in_the_blank **unfinished"),
    "fill_in_the_blank **unfinished",
  );
  assert.deepEqual(parseQuestionText("<img src=x>"), [
    { type: "text", text: "<img src=x>" },
  ]);
});
