import { NextRequest, NextResponse } from "next/server";
import { getSiteBaseUrl } from "@/lib/site-url";
import { verifyBotRequestAuth } from "@/lib/discord-auth";
import { getPendingEventsForMember } from "@/lib/event-list";

// Lists open events `userId` hasn't fully answered yet, for the Discord bot's "/schedule todo" command.
// `userId` is the Discord user ID of whoever ran the command (taken from the interaction by the bot).
export async function GET(request: NextRequest) {
  if (!verifyBotRequestAuth(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = request.nextUrl.searchParams.get("userId");
  if (!userId) {
    return NextResponse.json({ error: "userIdパラメータは必須です" }, { status: 400 });
  }

  const events = await getPendingEventsForMember(userId);
  const baseUrl = getSiteBaseUrl(request);
  return NextResponse.json({ events: events.map((e) => ({ ...e, url: `${baseUrl}/events/${e.id}` })) });
}
