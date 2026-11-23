import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, decodeSession, encodeSession, sessionCookieOptions } from "@/lib/session-token";
import { checkGuildMembership, discordAvatarUrl, memberDisplayName } from "@/lib/discord-member";
import { MOCK_ID_PREFIX, isMockAuthEnabled } from "@/lib/mock-auth";

// Restricts the whole site to members of the target Discord server.
//
// - No valid session → pages redirect to /login, APIs get 401.
// - Valid session → every MEMBERSHIP_RECHECK_MS the user is re-looked-up in the guild with the bot
//   token, so someone who left (or was kicked) loses access within that window instead of keeping a
//   7-day cookie. The refreshed cookie also picks up nickname/avatar changes.
// - If Discord can't be reached for the re-check, access is kept (fail-open) and retried on the next
//   request, so a Discord outage doesn't lock every member out.
//
// Server Actions and route handlers still check the session themselves (see lib/discord-auth.ts);
// this proxy is the outer gate, not the only one.

const MEMBERSHIP_RECHECK_MS = 24 * 60 * 60 * 1000; // once a day

// Reachable without logging in. /api/bot/* authenticates with BOT_EVENTS_SECRET instead.
const PUBLIC_PREFIXES = ["/login", "/api/auth/", "/api/bot/"];

function isPublic(pathname: string): boolean {
  return PUBLIC_PREFIXES.some((p) => pathname === p.replace(/\/$/, "") || pathname.startsWith(p));
}

function deny(request: NextRequest, error?: string): NextResponse {
  const { pathname, search } = request.nextUrl;
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const loginUrl = new URL("/login", request.url);
  if (pathname !== "/") loginUrl.searchParams.set("next", pathname + search);
  if (error) loginUrl.searchParams.set("error", error);
  return NextResponse.redirect(loginUrl);
}

export async function proxy(request: NextRequest) {
  if (isPublic(request.nextUrl.pathname)) return NextResponse.next();

  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const session = token ? decodeSession(token) : null;
  if (!session) {
    const res = deny(request);
    if (token) res.cookies.delete(SESSION_COOKIE); // forged / stale-secret cookie
    return res;
  }

  // Dev-only mock sessions skip the Discord check, and are refused outright when mock auth is off
  // (including any mock-prefixed id, in case a session was minted some other way).
  if (session.mock || session.id.startsWith(MOCK_ID_PREFIX)) {
    if (isMockAuthEnabled()) return NextResponse.next();
    const res = deny(request);
    res.cookies.delete(SESSION_COOKIE);
    return res;
  }

  if (session.verifiedAt && Date.now() - session.verifiedAt < MEMBERSHIP_RECHECK_MS) {
    return NextResponse.next();
  }

  const check = await checkGuildMembership(session.id);
  if (check.status === "not_member") {
    const res = deny(request, "not_member");
    res.cookies.delete(SESSION_COOKIE);
    return res;
  }
  if (check.status === "unknown") return NextResponse.next();

  const refreshed = encodeSession({
    ...session,
    displayName: memberDisplayName(check.member),
    avatarUrl: discordAvatarUrl(check.member),
    verifiedAt: Date.now(),
  });
  // Make the refreshed session visible to this same request's render, and persist it in the browser.
  request.cookies.set(SESSION_COOKIE, refreshed);
  const res = NextResponse.next({ request: { headers: request.headers } });
  res.cookies.set(SESSION_COOKIE, refreshed, sessionCookieOptions);
  return res;
}

export const config = {
  // Everything except framework assets and files served from /public.
  matcher: ["/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:png|svg|jpg|jpeg|gif|webp|ico)$).*)"],
};
