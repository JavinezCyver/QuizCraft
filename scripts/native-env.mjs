import { existsSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { delimiter, dirname, join } from "node:path";

export function nativeEnvironment() {
  const env = { ...process.env };
  const pathKey =
    Object.keys(env).find((key) => key.toLowerCase() === "path") || "PATH";
  env[pathKey] = [
    dirname(process.execPath),
    join(homedir(), ".cargo", "bin"),
    env[pathKey] || "",
  ].join(delimiter);
  if (process.platform === "win32") {
    const sdk = join(homedir(), "AppData", "Local", "Android", "Sdk");
    if (!env.ANDROID_HOME && existsSync(sdk)) env.ANDROID_HOME = sdk;
    const jbr = "C:/Program Files/Android/Android Studio/jbr";
    if (existsSync(join(jbr, "bin", "java.exe"))) env.JAVA_HOME = jbr;
    if (!env.NDK_HOME && env.ANDROID_HOME) {
      const root = join(env.ANDROID_HOME, "ndk");
      if (existsSync(root)) {
        const versions = readdirSync(root)
          .filter((v) => /^\d/.test(v))
          .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
        if (versions.length) env.NDK_HOME = join(root, versions.at(-1));
      }
    }
  }
  return env;
}
