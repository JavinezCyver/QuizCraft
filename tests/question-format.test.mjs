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

test("explicit italic markup supports partial words and retains legacy underscore text", () => {
  assert.deepEqual(parseQuestionText("B<i>atm</i>an"), [
    { type: "text", text: "B" },
    { type: "italic", children: [{ type: "text", text: "atm" }] },
    { type: "text", text: "an" },
  ]);
  assert.equal(
    plainQuestionText("<i>Bat</i>man and Bat<i>man</i>"),
    "Batman and Batman",
  );
  assert.equal(
    plainQuestionText("fill_in_the_blank _legacy_"),
    "fill_in_the_blank legacy",
  );
  assert.equal(
    plainQuestionText('<i onclick="alert(1)">text</i>'),
    '<i onclick="alert(1)">text</i>',
  );
});
