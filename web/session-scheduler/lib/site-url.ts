import type { NextRequest } from "next/server";

// Public base URL of the site (no trailing slash). Prefers SITE_BASE_URL, tolerating a value written
// without a scheme (e.g. "localhost:3002"), and otherwise uses `fallbackOrigin`.
export function resolveSiteBaseUrl(fallbackOrigin: string): string {
  const raw = process.env.SITE_BASE_URL?.trim();
  if (raw) {
    const withScheme = /^https?:\/\//i.test(raw) ? raw : `http://${raw}`;
    try {
      return new URL(withScheme).origin;
    } catch {
      console.error(`Invalid SITE_BASE_URL "${raw}"; falling back to request origin.`);
    }
  }
  return fallbackOrigin.replace(/\/+$/, "");
}

// For route handlers.
export function getSiteBaseUrl(request: NextRequest): string {
  return resolveSiteBaseUrl(request.nextUrl.origin);
}

// For server components (no request object): rebuilds the origin from forwarded/host headers.
export function siteBaseUrlFromHeaders(h: Headers): string {
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return resolveSiteBaseUrl(`${proto}://${host}`);
}
