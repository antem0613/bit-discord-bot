import type { NextRequest } from "next/server";

// Public base URL of the site (no trailing slash). Prefers SITE_BASE_URL, tolerating a value written
// without a scheme (e.g. "localhost:3002"), and falls back to the incoming request's origin.
export function getSiteBaseUrl(request: NextRequest): string {
  const raw = process.env.SITE_BASE_URL?.trim();
  if (raw) {
    const withScheme = /^https?:\/\//i.test(raw) ? raw : `http://${raw}`;
    try {
      return new URL(withScheme).origin;
    } catch {
      console.error(`Invalid SITE_BASE_URL "${raw}"; falling back to request origin.`);
    }
  }
  return request.nextUrl.origin;
}
