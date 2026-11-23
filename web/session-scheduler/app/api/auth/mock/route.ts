import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { encodeSession, SESSION_COOKIE, sessionCookieOptions, safeNextPath } from "@/lib/session-token";
import { defaultAvatarUrl } from "@/lib/discord-member";
import { MOCK_ID_PREFIX, isMockAuthEnabled, toMockUserId } from "@/lib/mock-auth";
import { getSiteBaseUrl } from "@/lib/site-url";

// Dev-only mock login: GET /api/auth/mock?user=alice&name=アリス&next=/events/new
//   user  [a-z0-9_-]{1,32}, default "tester" → session id "mock-<user>" (never a real Discord id)
//   name  display name, default "テスト<user>"
//   next  same-origin path to land on, default "/"
// Upserts the Member row (events reference it as creator/respondent) and sets a session that the
// proxy accepts without a Discord membership check. Returns 404 unless mock auth is enabled.
export async function GET(request: NextRequest) {
  if (!isMockAuthEnabled()) {
    return new NextResponse("Not Found", { status: 404 });
  }

  const params = request.nextUrl.searchParams;
  const userKey = params.get("user") ?? "tester";
  const id = toMockUserId(userKey);
  if (!id) {
    return NextResponse.json({ error: "user must match [a-z0-9_-]{1,32}" }, { status: 400 });
  }
  const displayName = (params.get("name") ?? "").trim().slice(0, 32) || `テスト${userKey}`;

  await prisma.member.upsert({
    where: { id },
    create: { id, username: id, displayName },
    update: { displayName },
  });

  const res = NextResponse.redirect(new URL(safeNextPath(params.get("next")), getSiteBaseUrl(request)));
  res.cookies.set(
    SESSION_COOKIE,
    encodeSession({ id, username: id, displayName, avatarUrl: defaultAvatarUrl("0"), verifiedAt: Date.now(), mock: true }),
    sessionCookieOptions
  );
  return res;
}

// Dev-only cleanup: DELETE /api/auth/mock removes every event created by a mock user and every mock
// member (their responses / participant rows cascade). Real users' data is untouched, except for
// mock users' answers on real users' events. Returns 404 unless mock auth is enabled.
export async function DELETE() {
  if (!isMockAuthEnabled()) {
    return new NextResponse("Not Found", { status: 404 });
  }

  const mockMembers = { startsWith: MOCK_ID_PREFIX };
  const [events, members] = await prisma.$transaction([
    prisma.event.deleteMany({ where: { creatorId: mockMembers } }),
    prisma.member.deleteMany({ where: { id: mockMembers } }),
  ]);
  return NextResponse.json({ deletedEvents: events.count, deletedMembers: members.count });
}
