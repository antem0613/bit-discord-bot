import { NextRequest, NextResponse } from "next/server";
import { verifyBotRequestAuth } from "@/lib/discord-auth";
import { getRecruitingEvents } from "@/lib/event-list";

// Lists currently-recruiting ("募集中") events for the Discord bot's equivalent command.
export async function GET(request: NextRequest) {
  if (!verifyBotRequestAuth(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const events = await getRecruitingEvents();
  const withUrls = events.map((e) => ({ ...e, url: `${request.nextUrl.origin}/events/${e.id}` }));

  return NextResponse.json({ events: withUrls });
}
