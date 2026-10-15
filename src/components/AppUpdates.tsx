import { useEffect, useRef, useState } from "react";
import { Download, RefreshCw } from "lucide-react";
import { Button } from "./ui/button";
import {
  initialUpdateStatus,
  nativeUpdates,
  updateAction,
  updateBusy,
  type UpdateStatus,
} from "../lib/updates";

export function AppUpdates() {
  const [status, setStatus] = useState(initialUpdateStatus);
  const [pending, setPending] = useState(false);
  const mounted = useRef(true);
  const active = useRef(false);
  const revision = useRef(0);
  const android = nativeUpdates();
  const busy = pending || updateBusy(status);

  useEffect(() => {
    mounted.current = true;
    let polling = false;
    let disposed = false;
    async function refresh() {
      if (!android || polling || active.current || document.hidden) return;
      polling = true;
      const requested = revision.current;
      try {
        const value = await updateAction("status");
        if (
          !disposed &&
          mounted.current &&
          !active.current &&
          requested === revision.current
        )
          setStatus(value);
      } catch {
        // A transient resume/IPC failure must not discard a completed download.
      } finally {
        polling = false;
      }
    }
    void refresh();
    const interval = android ? window.setInterval(refresh, 800) : undefined;
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      mounted.current = false;
      disposed = true;
      window.clearInterval(interval);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [android]);

  async function perform(action: "check" | "download" | "install" | "allow") {
    if (active.current) return;
    active.current = true;
    revision.current++;
    setPending(true);
    try {
      const value = await updateAction(action);
      if (mounted.current) setStatus(value);
    } catch (error) {
      if (mounted.current)
        setStatus((previous) => ({
          ...previous,
          // Keep a verified download available after installer/permission errors.
          phase: previous.phase === "ready" ? "ready" : "error",
          error:
            typeof error === "string"
              ? error
              : error instanceof Error
                ? error.message
                : "Unable to update. Please try again.",
        }));
    } finally {
      active.current = false;
      if (mounted.current) setPending(false);
    }
  }

  const progress =
    status.totalBytes > 0
      ? Math.min(
          100,
          Math.floor((status.downloadedBytes / status.totalBytes) * 100),
        )
      : 0;
  const message =
    status.phase === "checking"
      ? "Checking for updates…"
      : status.phase === "downloading"
        ? `Downloading update… ${progress}%`
        : status.phase === "verifying"
          ? "Verifying the update…"
          : status.phase === "current"
            ? "You’re up to date."
            : status.phase === "available"
              ? `Version ${status.latestVersion} is available.`
              : status.phase === "ready"
                ? "Your update is ready to install."
                : "Check for the latest improvements.";

  return (
    <section className="app-updates" aria-labelledby="app-updates-title">
      <div className="app-updates-heading">
        <div>
          <h3 id="app-updates-title">App updates</h3>
          <small>Installed version {status.currentVersion}</small>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={busy}
          onClick={() => perform("check")}
        >
          <RefreshCw size={15} aria-hidden="true" />
          {pending && status.phase !== "ready"
            ? "Please wait…"
            : "Check for updates"}
        </Button>
      </div>
      <p role="status" aria-live="polite">
        {message}
      </p>
      {(status.phase === "downloading" || status.phase === "verifying") && (
        <progress
          aria-label="Update download progress"
          value={progress}
          max={100}
        />
      )}
      {status.error && (
        <p className="app-update-error" role="alert">
          {status.error}
        </p>
      )}
      {status.notes && (
        <details
          className="app-update-notes"
          open={status.phase === "available" || status.phase === "ready"}
        >
          <summary>What’s new in {status.latestVersion}</summary>
          <p>{status.notes}</p>
        </details>
      )}
      {status.phase === "available" &&
        (android ? (
          <Button
            type="button"
            disabled={busy}
            onClick={() => perform("download")}
          >
            <Download size={16} aria-hidden="true" />
            Download update
            {status.totalBytes > 0
              ? ` (${(status.totalBytes / 1048576).toFixed(1)} MB)`
              : ""}
          </Button>
        ) : (
          <Button asChild>
            <a href={status.downloadUrl} download>
              Download Android update
            </a>
          </Button>
        ))}
      {status.phase === "error" && android && status.hasUpdate && (
        <Button
          type="button"
          disabled={busy}
          onClick={() => perform("download")}
        >
          Retry download
        </Button>
      )}
      {status.phase === "ready" && android && (
        <>
          {!status.canInstall && (
            <p>
              Allow QuizCraft to install app updates, then return here to
              install.
            </p>
          )}
          <Button
            type="button"
            disabled={busy}
            onClick={() => perform(status.canInstall ? "install" : "allow")}
          >
            {status.canInstall ? "Install update" : "Allow app updates"}
          </Button>
        </>
      )}
      {status.message && <p>{status.message}</p>}
      <small>
        {android
          ? "Updates need internet. Android will ask you to confirm installation. Your flashcards stay saved."
          : "Check and download Android updates here. In-app installation is available in the Android app."}
      </small>
    </section>
  );
}
