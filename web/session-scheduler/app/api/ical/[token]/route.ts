import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { buildMemberFeed } from "@/lib/ical";
import { getSiteBaseUrl } from "@/lib/site-url";

// GET /api/ical/<token>.ics — a member's personal calendar feed. Calendar apps can't log in with
// Discord, so this path is public in proxy.ts and the unguessable token (see app/actions/ical.ts) is
// the credential. Unknown/revoked tokens get a plain 404.
export async function GET(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const raw = (await params).token.replace(/\.ics$/i, "");
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(raw)) return new NextResponse("Not Found", { status: 404 });

  const member = await prisma.member.findUnique({ where: { icalToken: raw }, select: { id: true } });
  if (!member) return new NextResponse("Not Found", { status: 404 });

  const body = await buildMemberFeed(member.id, getSiteBaseUrl(request));
  return new NextResponse(body, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="bit-schedule.ics"',
      "Cache-Control": "private, max-age=300",
      "X-Robots-Tag": "noindex",
    },
  });
}
