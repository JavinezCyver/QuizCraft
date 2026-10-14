import { test, expect } from "@playwright/test";

test("shared React UI uses Tauri commands for authenticated API calls", async ({
  page,
}) => {
  await page.request.post("/api/auth/register", {
    data: {
      email: `native-bridge-${Date.now()}@example.test`,
      name: "Native learner",
      password: "native-password",
    },
  });
  await page.addInitScript(() => {
    const runtime = window as unknown as {
      isTauri: boolean;
      nativeCalls: string[];
      __TAURI_INTERNALS__: {
        invoke: (
          command: string,
          args?: { path: string; method: string; body: unknown },
        ) => Promise<unknown>;
      };
    };
    runtime.isTauri = true;
    runtime.nativeCalls = [];
    runtime.__TAURI_INTERNALS__ = {
      invoke: async (command, args) => {
        if (command === "public_url") return "https://study.example.test";
        if (command !== "api_request" || !args)
          throw new Error("Unexpected native command");
        runtime.nativeCalls.push(args.path);
        const response = await fetch("/api" + args.path, {
          method: args.method,
          headers: { "Content-Type": "application/json" },
          ...(args.body === null ? {} : { body: JSON.stringify(args.body) }),
        });
        return { status: response.status, data: await response.json() };
      },
    };
  });
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Open profile", exact: true }),
  ).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as unknown as { nativeCalls: string[] }).nativeCalls,
      ),
    )
    .toEqual(expect.arrayContaining(["/me", "/quizzes", "/library"]));
});
