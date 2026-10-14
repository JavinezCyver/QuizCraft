import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export const cargo = existsSync(
  join(
    homedir(),
    ".cargo",
    "bin",
    process.platform === "win32" ? "cargo.exe" : "cargo",
  ),
)
  ? join(
      homedir(),
      ".cargo",
      "bin",
      process.platform === "win32" ? "cargo.exe" : "cargo",
    )
  : "cargo";

if (process.argv[1]?.endsWith("cargo.mjs")) {
  const child = spawn(cargo, process.argv.slice(2), { stdio: "inherit" });
  child.on("error", (error) => {
    console.error(
      "Rust is required. Install from https://rustup.rs/",
      error.message,
    );
    process.exitCode = 1;
  });
  child.on("exit", (code) => {
    process.exitCode = code ?? 1;
  });
  for (const signal of ["SIGINT", "SIGTERM"])
    process.on(signal, () => child.kill(signal));
}
