import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import {
  LOGIN_NEXT_COOKIE,
  SESSION_COOKIE,
  STATE_COOKIE,
  discordAvatarUrl,
  encodeSession,
  exchangeCodeForToken,
  fetchGuildMember,
  memberDisplayName,
  sessionCookieOptions,
} from "@/lib/discord-auth";
import { safeNextPath } from "@/lib/session-token";
import { prisma } from "@/lib/prisma";
import { getSiteBaseUrl } from "@/lib/site-url";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  const baseUrl = getSiteBaseUrl(request);

  const cookieStore = await cookies();
  const savedState = cookieStore.get(STATE_COOKIE)?.value;
  const next = safeNextPath(cookieStore.get(LOGIN_NEXT_COOKIE)?.value);
  cookieStore.delete(STATE_COOKIE);
  cookieStore.delete(LOGIN_NEXT_COOKIE);

  if (!code || !state || !savedState || state !== savedState) {
    return NextResponse.redirect(new URL("/login?error=invalid_state", baseUrl));
  }

  try {
    const accessToken = await exchangeCodeForToken(code);
    const member = await fetchGuildMember(accessToken);
    if (!member) {
      return NextResponse.redirect(new URL("/login?error=not_member", baseUrl));
    }

    const displayName = memberDisplayName(member);

    // Keep the Member row in sync so it can be referenced as an event creator/respondent.
    await prisma.member.upsert({
      where: { id: member.user.id },
      create: { id: member.user.id, username: member.user.username, displayName },
      update: { username: member.user.username, displayName },
    });

    cookieStore.set(
      SESSION_COOKIE,
      encodeSession({
        id: member.user.id,
        username: member.user.username,
        displayName,
        avatarUrl: discordAvatarUrl(member),
        verifiedAt: Date.now(),
      }),
      sessionCookieOptions
    );
  } catch (error) {
    console.error("Discord login failed:", error);
    return NextResponse.redirect(new URL("/login?error=login_failed", baseUrl));
  }

  return NextResponse.redirect(new URL(next, baseUrl));
}
