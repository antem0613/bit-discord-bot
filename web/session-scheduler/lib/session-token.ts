// Signed session cookie encoding, shared by the app (lib/discord-auth.ts) and proxy.ts.
// Kept free of `next/headers` so it can run in the proxy.
import crypto from "node:crypto";

export const SESSION_COOKIE = "session";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

export type SessionUser = {
  id: string;
  username: string;
  displayName: string;
  // Absent on sessions issued before avatars were stored; use `avatarUrlFor` to get a fallback.
  avatarUrl?: string;
  // Epoch ms of the last confirmation that the user is still in the guild. Absent on older sessions,
  // which proxy.ts treats as "needs re-checking now".
  verifiedAt?: number;
  // Issued by the dev-only mock login (lib/mock-auth.ts). Rejected whenever mock auth is disabled.
  mock?: boolean;
};

function getSessionSecret(): string {
  const value = process.env.SESSION_SECRET;
  if (!value) throw new Error("Missing required environment variable: SESSION_SECRET");
  return value;
}

function sign(payload: string): string {
  return crypto.createHmac("sha256", getSessionSecret()).update(payload).digest("base64url");
}

export function encodeSession(user: SessionUser): string {
  const payload = Buffer.from(JSON.stringify(user)).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function decodeSession(token: string): SessionUser | null {
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;

  const expected = Buffer.from(sign(payload));
  const actual = Buffer.from(signature);
  if (expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) {
    return null;
  }

  try {
    return JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as SessionUser;
  } catch {
    return null;
  }
}

export const sessionCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  maxAge: SESSION_MAX_AGE_SECONDS,
  path: "/",
};

// Only allows same-origin relative paths ("/events/x?y"), rejecting "//evil.com", "/\evil.com", etc.
export function safeNextPath(raw: string | null | undefined): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\")) return "/";
  if (raw.startsWith("/login") || raw.startsWith("/api/")) return "/";
  return raw;
}
