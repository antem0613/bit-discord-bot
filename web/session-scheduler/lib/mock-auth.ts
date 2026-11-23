// Mock login for local testing (e.g. Claude driving the app with Playwright) without Discord OAuth.
//
// Enabled only when BOTH hold:
//   - NODE_ENV !== "production"  (so `next start` / the Docker image can never enable it)
//   - MOCK_AUTH=1 in the environment
// See app/api/auth/mock/route.ts for usage.

export const MOCK_ID_PREFIX = "mock-";

export function isMockAuthEnabled(): boolean {
  return process.env.NODE_ENV !== "production" && process.env.MOCK_AUTH === "1";
}

// "alice" -> "mock-alice"; returns null for anything outside [a-z0-9_-]{1,32}.
export function toMockUserId(raw: string | null | undefined): string | null {
  const name = (raw ?? "").trim().toLowerCase();
  if (!/^[a-z0-9_-]{1,32}$/.test(name)) return null;
  return `${MOCK_ID_PREFIX}${name}`;
}
