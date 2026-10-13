import { test } from "node:test";
import assert from "node:assert/strict";
import { isAllowedOrigin } from "../server/origin.mjs";

test("accepts same-origin Vite requests on alternate ports and LAN addresses", () => {
  for (const host of [
    "localhost:5174",
    "127.0.0.1:5175",
    "192.168.1.42:5173",
    "[::1]:5174",
  ]) {
    assert.equal(
      isAllowedOrigin(`http://${host}`, {
        protocol: "http",
        host,
        appOrigin: "http://localhost:5173",
      }),
      true,
    );
  }
});
test("accepts configured HTTPS origin behind a proxy and normalizes its trailing slash", () => {
  assert.equal(
    isAllowedOrigin("https://quiz.example.com", {
      protocol: "http",
      host: "internal:3001",
      appOrigin: "https://quiz.example.com/",
      production: true,
    }),
    true,
  );
});
test("rejects unrelated, null, malformed, and lookalike origins", () => {
  const options = {
    protocol: "http",
    host: "localhost:5174",
    production: true,
  };
  for (const origin of [
    "https://evil.example",
    "null",
    "http://localhost:5174.evil.example",
    "http://localhost:5173",
    "not a URL",
    "file:///tmp/page",
  ]) {
    assert.equal(isAllowedOrigin(origin, options), false, origin);
  }
  assert.equal(isAllowedOrigin(undefined, options), true);
});
