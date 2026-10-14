import { spawn } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { homedir } from "node:os";
import { nativeEnvironment } from "./native-env.mjs";

const env = nativeEnvironment();
const release = process.argv.includes("--release");
const mode = release ? "release" : "debug";
const variant = release ? "Release" : "Debug";
if (release && !existsSync(
  env.QUIZCRAFT_ANDROID_KEYSTORE_PROPERTIES ||
  join(homedir(), ".android/quizcraft-release/keystore.properties"),
)) throw new Error("Release signing configuration is missing. See README.md.");
function publishApk() {
  const directory = resolve(
    `src-tauri/gen/android/app/build/outputs/apk/arm64/${mode}`,
  );
  const apk = join(directory, "QuizCraft.apk");
  copyFileSync(join(directory, `app-arm64-${mode}.apk`), apk);
  console.log(`APK: ${apk}`);
}
function run(command, args, cwd = process.cwd()) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env,
      stdio: ["inherit", "pipe", "pipe"],
    });
    let output = "";
    child.stdout.on("data", (data) => {
      process.stdout.write(data);
      output += data;
    });
    child.stderr.on("data", (data) => {
      process.stderr.write(data);
      output += data;
    });
    child.on("error", reject);
    child.on("exit", (code) => resolve({ code: code ?? 1, output }));
  });
}

const result = await run(process.execPath, [
  "scripts/tauri-cli.cjs",
  "android",
  "build",
  ...(release ? [] : ["--debug"]),
  "--apk",
  "--target",
  "aarch64",
  "--ci",
]);
if (result.code === 0) {
  publishApk();
  process.exit(0);
}
if (
  process.platform !== "win32" ||
  !result.output.includes("Creation symbolic link is not allowed")
)
  process.exit(result.code);

// The CLI has just successfully compiled this library; only symlinking failed.
// Copy that fresh library and ask Gradle to package it without repeating Rust.
const library = resolve(
  `target/aarch64-linux-android/${mode}/libquizcraft_mobile.so`,
);
if (!existsSync(library))
  throw new Error("The compiled Android library was not found.");
const android = resolve("src-tauri/gen/android");
const libs = join(android, "app/src/main/jniLibs/arm64-v8a");
mkdirSync(libs, { recursive: true });
copyFileSync(library, join(libs, "libquizcraft_mobile.so"));
console.log(
  "Windows disallows symlinks. Packaging the freshly compiled library using a file copy.",
);
const packaged = await run(
  "cmd.exe",
  [
    "/d",
    "/c",
    "gradlew.bat",
    `:app:assembleArm64${variant}`,
    "-x",
    `:app:rustBuildArm64${variant}`,
    "-PabiList=arm64-v8a",
    "-ParchList=arm64",
    "-PtargetList=aarch64",
    "--no-configuration-cache",
  ],
  android,
);
process.exitCode = packaged.code;
if (packaged.code === 0) publishApk();
