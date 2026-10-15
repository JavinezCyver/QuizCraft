import { test, expect, type Page } from "@playwright/test";
import appPackage from "../../package.json" with { type: "json" };

const currentVersion = appPackage.version;
const nextVersion = `${Number(currentVersion.split(".")[0]) + 1}.0.0`;

async function settings(page: Page) {
  await page.goto("/");
  await expect(
    page.getByRole("heading", {
      name: "Your library starts here",
      exact: true,
    }),
  ).toBeVisible({ timeout: 15000 });
  await expect(page.locator("#startup-splash")).toHaveCount(0, {
    timeout: 10000,
  });
  await page
    .getByRole("button", { name: "Open settings", exact: true })
    .click();
  return page.getByRole("region", { name: "App updates", exact: true });
}
const latest = (version = nextVersion) => ({
  tag_name: `v${version}`,
  draft: false,
  prerelease: false,
  body: "New flashcard improvements.\n<script>window.injected = true</script>",
  assets: [
    {
      name: `QuizCraft-${version}-android-arm64.apk`,
      state: "uploaded",
      size: 11000000,
      browser_download_url: `https://github.com/JavinezCyver/QuizCraft/releases/download/v${version}/QuizCraft-${version}-android-arm64.apk`,
    },
  ],
});

test("Settings checks updates and shows release notes with a direct APK download", async ({
  page,
}) => {
  let requests = 0;
  await page.route(
    "https://api.github.com/repos/JavinezCyver/QuizCraft/releases/latest",
    (route) => {
      requests++;
      return route.fulfill({ json: latest() });
    },
  );
  const section = await settings(page);
  await expect(
    section.getByText(`Installed version ${currentVersion}`),
  ).toBeVisible();
  await expect(section.getByRole("link")).toHaveCount(0);
  await section.getByRole("button", { name: "Check for updates" }).click();
  await expect(section.getByRole("status")).toHaveText(
    `Version ${nextVersion} is available.`,
  );
  await expect(section.getByText(latest().body)).toBeVisible();
  await expect(
    section.getByRole("link", { name: "Download Android update" }),
  ).toHaveAttribute("href", latest().assets[0].browser_download_url);
  expect(await page.evaluate(() => (window as any).injected)).toBeUndefined();
  expect(requests).toBe(1);
  await expect(page.getByRole("dialog")).toBeVisible();
});

test("offline update checks fail gently and can be retried without affecting saved settings", async ({
  page,
}) => {
  let offline = true;
  await page.route(
    "https://api.github.com/repos/JavinezCyver/QuizCraft/releases/latest",
    (route) =>
      offline
        ? route.abort("internetdisconnected")
        : route.fulfill({ json: latest(currentVersion) }),
  );
  const section = await settings(page);
  await section.getByRole("button", { name: "Check for updates" }).click();
  await expect(section.getByRole("alert")).toBeVisible();
  offline = false;
  await section.getByRole("button", { name: "Check for updates" }).click();
  await expect(section.getByRole("status")).toHaveText("You’re up to date.");
  await expect(section.getByRole("alert")).toHaveCount(0);
  await page.getByLabel("Display name").fill("Study learner");
  await page
    .getByRole("button", { name: "Save settings", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("missing or untrusted release files never produce an install or download link", async ({
  page,
}) => {
  const release = latest();
  release.assets[0].browser_download_url = "https://example.com/untrusted.apk";
  await page.route(
    "https://api.github.com/repos/JavinezCyver/QuizCraft/releases/latest",
    (route) => route.fulfill({ json: release }),
  );
  const section = await settings(page);
  await section.getByRole("button", { name: "Check for updates" }).click();
  await expect(section.getByRole("alert")).toContainText(
    "has not been uploaded yet",
  );
  await expect(section.getByRole("link")).toHaveCount(0);
});

for (const width of [320, 390, 768])
  test(`native update progress, permissions and installer controls fit ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.addInitScript(
      ({ currentVersion, nextVersion }) => {
        Object.defineProperty(navigator, "userAgent", {
          value: "Android QuizCraft",
        });
        (window as any).isTauri = true;
        const state = {
          phase: "idle",
          currentVersion,
          latestVersion: "",
          hasUpdate: false,
          notes: "",
          totalBytes: 1000,
          downloadedBytes: 0,
          canInstall: false,
          message: "",
          error: "",
        };
        let downloads = 0;
        (window as any).__updateCalls = [];
        (window as any).__TAURI_INTERNALS__ = {
          invoke: async (command: string, args: { action: string }) => {
            if (command !== "app_update")
              throw new Error("Unexpected native command");
            (window as any).__updateCalls.push(args.action);
            if (args.action === "check")
              Object.assign(state, {
                phase: "available",
                latestVersion: nextVersion,
                hasUpdate: true,
                notes: "Improved flashcards. ".repeat(100),
              });
            if (args.action === "download") {
              state.phase = "downloading";
              downloads++;
            }
            if (args.action === "status" && state.phase === "downloading") {
              state.downloadedBytes += 250;
              if (state.downloadedBytes >= 1000) state.phase = "ready";
            }
            if (args.action === "allow") state.canInstall = true;
            if (args.action === "install")
              state.message = "Confirm the update in Android’s installer.";
            (window as any).__downloads = downloads;
            return { ...state };
          },
        };
      },
      { currentVersion, nextVersion },
    );
    const section = await settings(page);
    await section.getByRole("button", { name: "Check for updates" }).click();
    const download = section.getByRole("button", { name: /^Download update/ });
    await download.click();
    await expect(section.getByRole("progressbar")).toBeVisible();
    await expect(
      section.getByRole("button", { name: "Check for updates" }),
    ).toBeDisabled();
    await page.getByRole("button", { name: "Close", exact: true }).click();
    await page
      .getByRole("button", { name: "Open settings", exact: true })
      .click();
    await section.getByRole("button", { name: "Allow app updates" }).click();
    await section.getByRole("button", { name: "Install update" }).click();
    await expect(
      section.getByText("Confirm the update in Android’s installer.", {
        exact: true,
      }),
    ).toBeVisible();
    expect(await page.evaluate(() => (window as any).__downloads)).toBe(1);
    const dimensions = await page.getByRole("dialog").evaluate((element) => ({
      width: element.scrollWidth,
      client: element.clientWidth,
      right: element.getBoundingClientRect().right,
    }));
    expect(dimensions.width).toBeLessThanOrEqual(dimensions.client + 1);
    expect(dimensions.right).toBeLessThanOrEqual(width);
    await expect(page.getByRole("dialog")).toBeVisible();
  });
