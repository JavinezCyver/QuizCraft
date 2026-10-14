// Node is only a development launcher. Production runs quizcraft-server directly.
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
const executable =
  process.platform === "win32" ? "quizcraft-server.exe" : "quizcraft-server";
const candidates = [
  join("target", "release", executable),
  join("target", "debug", executable),
];
const binary = candidates.find(existsSync);
if (!binary) {
  console.error(
    "Build the Rust API first: npm run build:api (or node scripts/cargo.mjs build -p quizcraft-server).",
  );
  process.exit(1);
}
const child = spawn(binary, process.argv.slice(2), { stdio: "inherit" });
child.on("error", (error) => {
  console.error(error.message);
  process.exitCode = 1;
});
child.on("exit", (code) => {
  process.exitCode = code ?? 1;
});
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => child.kill(signal));
process.on("exit", () => child.kill());
