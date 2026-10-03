import { NextRequest, NextResponse } from "next/server";
import { verifyBotRequestAuth } from "@/lib/discord-auth";
import { runDayBeforeReminders } from "@/lib/notifications";

// Triggered once a day (08:00 JST) by the Discord bot's scheduler to send "event is tomorrow" DMs.
// All the actual date-range/eligibility logic and DM sending lives in `runDayBeforeReminders`; this
// route is just the authenticated entry point for the bot to kick it off.
export async function POST(request: NextRequest) {
  if (!verifyBotRequestAuth(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await runDayBeforeReminders();
    return NextResponse.json(result);
  } catch (error) {
    console.error("Failed to run day-before reminders:", error);
    return NextResponse.json({ error: "リマインダーの実行に失敗しました" }, { status: 500 });
  }
}
