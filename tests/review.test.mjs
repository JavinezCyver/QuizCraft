import { test } from "node:test";
import assert from "node:assert/strict";
import { pendingReviewIds } from "../src/lib/review.ts";

test("the next pass contains BAD, GOOD and unrated cards once, in deck order", () => {
  assert.deepEqual(
    pendingReviewIds(
      ["a", "b", "c", "d"],
      {
        a: "good",
        b: "satisfied",
        c: "bad",
        d: "unrated",
      },
      ["a", "b", "c", "d"],
    ),
    ["a", "c", "d"],
  );
});

test("SATISFIED still requires an answer and no rating still requires review", () => {
  assert.deepEqual(
    pendingReviewIds(
      ["a", "b", "c"],
      {
        a: "satisfied",
        b: "satisfied",
      },
      ["b", "c"],
    ),
    ["a", "c"],
  );
});

test("the session can finish only when every card is answered and SATISFIED", () => {
  assert.deepEqual(
    pendingReviewIds(
      ["a", "b"],
      {
        a: "satisfied",
        b: "satisfied",
      },
      ["a", "b"],
    ),
    [],
  );
});
