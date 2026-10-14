import { spawn } from "node:child_process";
import { nativeEnvironment } from "./native-env.mjs";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../", import.meta.url));
const env = nativeEnvironment();
const child = spawn(
  process.execPath,
  [
    fileURLToPath(new URL("./tauri-cli.cjs", import.meta.url)),
    ...process.argv.slice(2),
  ],
  { stdio: "inherit", env, cwd: root },
);
child.on("error", (error) => {
  console.error(error.message);
  process.exitCode = 1;
});
child.on("exit", (code) => {
  process.exitCode = code ?? 1;
});
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => child.kill(signal));
