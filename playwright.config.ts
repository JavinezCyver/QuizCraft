import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/browser",
  testMatch: [
    "offline.spec.ts",
    "mobile-carousel.spec.ts",
    "flashcard-authoring.spec.ts",
    "flashcard-responsive.spec.ts",
    "updates.spec.ts",
  ],
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
    command: "npx vite preview --host 127.0.0.1 --port 3003 --strictPort",
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
