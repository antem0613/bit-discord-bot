import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import {
  SESSION_COOKIE,
  STATE_COOKIE,
  encodeSession,
  exchangeCodeForToken,
  fetchGuildMember,
} from "@/lib/discord-auth";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");

  const cookieStore = await cookies();
  const savedState = cookieStore.get(STATE_COOKIE)?.value;
  cookieStore.delete(STATE_COOKIE);

  if (!code || !state || !savedState || state !== savedState) {
    return NextResponse.redirect(new URL("/?error=invalid_state", request.url));
  }

  try {
    const accessToken = await exchangeCodeForToken(code);
    const member = await fetchGuildMember(accessToken);
    if (!member) {
      return NextResponse.redirect(new URL("/?error=not_member", request.url));
    }

    const displayName = member.nick ?? member.user.global_name ?? member.user.username;

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
      }),
      {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 60 * 60 * 24 * 7,
        path: "/",
      }
    );
  } catch (error) {
    console.error("Discord login failed:", error);
    return NextResponse.redirect(new URL("/?error=login_failed", request.url));
  }

  return NextResponse.redirect(new URL("/", request.url));
}
