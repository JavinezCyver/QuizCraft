import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/browser",
  timeout: 45000,
  workers: 1,
  use: {
    baseURL: "http://localhost:3003",
    launchOptions: {
      executablePath:
        process.env.CHROME_PATH ||
        "C:/Program Files/Google/Chrome/Application/chrome.exe",
    },
    headless: true,
  },
  webServer: {
    command: "node tests/browser/server.mjs",
    port: 3003,
    reuseExistingServer: false,
    env: {
      PORT: "3003",
      APP_ORIGIN: "http://localhost:3003",
      DATABASE_PATH: `./data/browser-test-${Date.now()}.sqlite`,
    },
  },
  reporter: "list",
  outputDir: "test-results",
});
