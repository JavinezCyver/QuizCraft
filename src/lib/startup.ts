export function prepareStartupScreen(root: HTMLElement): () => void {
  const splash = document.getElementById("startup-splash");
  if (!splash || getComputedStyle(splash).display === "none") {
    splash?.remove();
    return () => {};
  }

  const started = performance.now();
  root.inert = true;
  root.setAttribute("aria-hidden", "true");
  let finished = false;

  return () => {
    if (finished) return;
    finished = true;
    // Keep the brand briefly visible while the app loads underneath it.
    window.setTimeout(
      () => {
        splash.classList.add("is-leaving");
        const reducedMotion = matchMedia(
          "(prefers-reduced-motion: reduce)",
        ).matches;
        window.setTimeout(
          () => {
            splash.remove();
            root.inert = false;
            root.removeAttribute("aria-hidden");
          },
          reducedMotion ? 0 : 180,
        );
      },
      Math.max(0, 900 - (performance.now() - started)),
    );
  };
}
