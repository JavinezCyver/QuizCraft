// Explicit fixtures only for the isolated browser-test database.
import { seed } from "../../server/seed.mjs";
import { run } from "../../server/db.mjs";
seed();
run(
  "INSERT INTO users(id,email,password,name) VALUES(?,?,?,?)",
  "browser-fixture-owner",
  "fixtures@example.test",
  "not-a-login",
  "Test quiz creator",
);
run("UPDATE quizzes SET owner=?,demo=0 WHERE demo=1", "browser-fixture-owner");
await import("../../server/index.mjs");
