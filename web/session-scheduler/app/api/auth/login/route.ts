import crypto from "node:crypto";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { LOGIN_NEXT_COOKIE, STATE_COOKIE, buildAuthorizeUrl } from "@/lib/discord-auth";
import { safeNextPath, secureCookiesEnabled } from "@/lib/session-token";

export async function GET(request: NextRequest) {
  const state = crypto.randomBytes(16).toString("hex");
  const next = safeNextPath(request.nextUrl.searchParams.get("next"));

  const cookieStore = await cookies();
  const shortLived = {
    httpOnly: true,
    secure: secureCookiesEnabled(),
    sameSite: "lax" as const,
    maxAge: 300,
    path: "/",
  };
  cookieStore.set(STATE_COOKIE, state, shortLived);
  cookieStore.set(LOGIN_NEXT_COOKIE, next, shortLived);

  return NextResponse.redirect(buildAuthorizeUrl(state));
}
