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

test("underline preserves nested formatting and line breaks without interpreting arbitrary HTML", () => {
  assert.deepEqual(parseQuestionText("<u>Bruce\n**Wayne**</u>!"), [
    {
      type: "underline",
      children: [
        { type: "text", text: "Bruce\n" },
        { type: "bold", children: [{ type: "text", text: "Wayne" }] },
      ],
    },
    { type: "text", text: "!" },
  ]);
  assert.equal(plainQuestionText("<u>Bruce</u> _Wayne_!"), "Bruce Wayne!");
  const literal = '<u onclick="alert(1)">literal</u> <u>unfinished';
  assert.deepEqual(parseQuestionText(literal), [
    { type: "text", text: literal },
  ]);
});
