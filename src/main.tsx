import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles.css";
import { isTauri } from "@tauri-apps/api/core";
import { prepareStartupScreen } from "./lib/startup";

if (isTauri() && /Android/i.test(navigator.userAgent)) {
  document.documentElement.classList.add("android-app");
  document
    .querySelector('meta[name="viewport"]')
    ?.setAttribute(
      "content",
      "width=device-width,initial-scale=1,minimum-scale=1,maximum-scale=1,user-scalable=no,viewport-fit=cover,interactive-widget=resizes-content",
    );
}

// Pointer clicks stay clean; Tab navigation retains visible focus indicators.
document.documentElement.dataset.inputMode = "pointer";
window.addEventListener(
  "pointerdown",
  () => {
    document.documentElement.dataset.inputMode = "pointer";
  },
  true,
);
window.addEventListener(
  "keydown",
  (event) => {
    if (event.key === "Tab")
      document.documentElement.dataset.inputMode = "keyboard";
  },
  true,
);

// Native builds already contain every asset; browsers cache the production build.
if (import.meta.env.PROD && !isTauri() && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    void navigator.serviceWorker.register("/sw.js").catch((error) => {
      console.error("QuizCraft could not prepare offline startup.", error);
    });
  });
}
const root = document.getElementById("root")!;
const finishStartup = prepareStartupScreen(root);
ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <App onReady={finishStartup} />
  </React.StrictMode>,
);
