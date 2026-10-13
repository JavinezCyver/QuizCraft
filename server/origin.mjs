// Vite preserves the browser's Host header when proxying /api. Match that
// origin so alternate development ports and LAN URLs work without trusting
// arbitrary Origin or X-Forwarded-Host headers.
export function isAllowedOrigin(
  origin,
  { protocol, host, appOrigin, production },
) {
  if (!origin) return true;
  try {
    const url = new URL(origin);
    if (!["http:", "https:"].includes(url.protocol) || url.origin !== origin)
      return false;
    const allowed = new Set([new URL(`${protocol}://${host}`).origin]);
    if (appOrigin) allowed.add(new URL(appOrigin).origin);
    if (!production) {
      allowed.add("http://localhost:5173");
      allowed.add("http://127.0.0.1:5173");
    }
    return allowed.has(origin);
  } catch {
    return false;
  }
}
