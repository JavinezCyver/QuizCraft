import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";

function offlineCache() {
  return {
    name: "quizcraft-offline-cache",
    apply: "build" as const,
    closeBundle() {
      const files = (directory: string, prefix = ""): string[] =>
        readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
          const relative = `${prefix}${entry.name}`;
          return entry.isDirectory()
            ? files(join(directory, entry.name), `${relative}/`)
            : [relative];
        });
      const assets = files("dist").filter((file) => file !== "sw.js");
      const hash = createHash("sha256");
      assets.forEach((file) => hash.update(readFileSync(join("dist", file))));
      const version = `quizcraft-${hash.digest("hex").slice(0, 16)}`;
      writeFileSync(
        "dist/sw.js",
        `
const CACHE = ${JSON.stringify(version)};
const ASSETS = ${JSON.stringify(assets.map((file) => `/${file}`))};
self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)));
});
self.addEventListener("activate", event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith("quizcraft-") && key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", event => {
  if (event.request.method !== "GET" || new URL(event.request.url).origin !== self.location.origin) return;
  if (event.request.mode === "navigate") {
    event.respondWith(fetch(event.request).catch(() => caches.open(CACHE).then(cache => cache.match("/index.html"))));
    return;
  }
  event.respondWith(caches.open(CACHE).then(async cache => (await cache.match(event.request, { ignoreVary: true })) || fetch(event.request)));
});
`,
      );
    },
  };
}
export default defineConfig({
  plugins: [react(), tailwindcss(), offlineCache()],
  clearScreen: false,
  server: {
    port: 5173,
    strictPort: true,
    host: "0.0.0.0",
    watch: {
      ignored: [
        "**/src-tauri/**",
        "**/server-rust/**",
        "**/target/**",
        "**/data/**",
      ],
    },
  },
});
