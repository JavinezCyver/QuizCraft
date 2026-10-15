import { invoke, isTauri } from "@tauri-apps/api/core";
import { version } from "../../package.json";

export type UpdateStatus = {
  phase:
    | "idle"
    | "checking"
    | "available"
    | "current"
    | "downloading"
    | "verifying"
    | "ready"
    | "error";
  currentVersion: string;
  latestVersion: string;
  hasUpdate: boolean;
  notes: string;
  downloadedBytes: number;
  totalBytes: number;
  canInstall: boolean;
  message: string;
  error: string;
  downloadUrl?: string;
};
export const nativeUpdates = () =>
  isTauri() && /Android/i.test(navigator.userAgent);
export const initialUpdateStatus = (): UpdateStatus => ({
  phase: "idle",
  currentVersion: version,
  latestVersion: "",
  hasUpdate: false,
  notes: "",
  downloadedBytes: 0,
  totalBytes: 0,
  canInstall: false,
  message: "",
  error: "",
});
export const updateBusy = (status: UpdateStatus) =>
  ["checking", "downloading", "verifying"].includes(status.phase);

function versionCode(value: string): number {
  if (!/^\d+\.\d+\.\d+$/.test(value))
    throw new Error("Invalid release version.");
  const [major, minor, patch] = value.split(".").map(Number);
  const code = major * 1_000_000 + minor * 1000 + patch;
  if (
    major > 2147 ||
    minor >= 1000 ||
    patch >= 1000 ||
    code > 2147483647 ||
    code < 1
  )
    throw new Error("Unsupported release version.");
  return code;
}

export async function updateAction(
  action: "status" | "check" | "download" | "install" | "allow",
): Promise<UpdateStatus> {
  if (nativeUpdates()) return invoke<UpdateStatus>("app_update", { action });
  if (action === "status") return initialUpdateStatus();
  if (action !== "check")
    throw new Error("Install updates from the Android app.");
  const response = await fetch(
    "https://api.github.com/repos/JavinezCyver/QuizCraft/releases/latest",
    {
      headers: { Accept: "application/vnd.github+json" },
      signal: AbortSignal.timeout(20000),
      cache: "no-store",
    },
  ).catch(() => {
    throw new Error(
      "Unable to check for updates. Check your connection and try again.",
    );
  });
  if (!response.ok)
    throw new Error(
      response.status === 403 || response.status === 429
        ? "Update checks are temporarily limited. Please try again later."
        : "Unable to check for updates. Check your connection and try again.",
    );
  const release = await response.json();
  if (
    release.draft ||
    release.prerelease ||
    typeof release.tag_name !== "string" ||
    !release.tag_name.startsWith("v")
  )
    throw new Error("No stable update is available.");
  const latestVersion = release.tag_name.slice(1);
  const newer = versionCode(latestVersion) > versionCode(version);
  const name = `QuizCraft-${latestVersion}-android-arm64.apk`;
  const downloadUrl = `https://github.com/JavinezCyver/QuizCraft/releases/download/v${latestVersion}/${name}`;
  const asset =
    Array.isArray(release.assets) &&
    release.assets.find(
      (asset: {
        name?: string;
        state?: string;
        browser_download_url?: string;
      }) =>
        asset.name === name &&
        asset.state === "uploaded" &&
        asset.browser_download_url === downloadUrl,
    );
  if (newer && !asset)
    throw new Error(
      "The Android update has not been uploaded yet. Try again later.",
    );
  return {
    ...initialUpdateStatus(),
    phase: newer ? "available" : "current",
    latestVersion,
    hasUpdate: newer,
    notes:
      typeof release.body === "string" ? release.body.slice(0, 100000) : "",
    totalBytes: asset?.size || 0,
    downloadUrl: newer ? downloadUrl : undefined,
  };
}
