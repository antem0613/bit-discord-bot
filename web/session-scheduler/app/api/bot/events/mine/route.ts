import { NextRequest, NextResponse } from "next/server";
import { verifyBotRequestAuth } from "@/lib/discord-auth";
import { getMyUpcomingEvents } from "@/lib/event-list";

// Lists FINALIZED events `userId` participates in whose execution date is today or later, for the
// Discord bot's "my upcoming events" command. `userId` is the Discord user ID (not a secret — the bot
// already knows exactly who ran the command from the interaction itself).
export async function GET(request: NextRequest) {
  if (!verifyBotRequestAuth(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = request.nextUrl.searchParams.get("userId");
  if (!userId) {
    return NextResponse.json({ error: "userIdパラメータは必須です" }, { status: 400 });
  }

  const events = await getMyUpcomingEvents(userId);
  const baseUrl = (process.env.SITE_BASE_URL || request.nextUrl.origin).replace(/\/+$/, "");
  const withUrls = events.map((e) => ({ ...e, url: `${baseUrl}/events/${e.id}` }));

  return NextResponse.json({ events: withUrls });
}
