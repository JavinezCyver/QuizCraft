// Give generated Gradle tasks a stable command, independent of npm aliases.
require("@tauri-apps/cli")
  .run(process.argv.slice(2), "node ../scripts/tauri.mjs")
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
