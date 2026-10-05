import { NextRequest, NextResponse } from "next/server";
import { verifyBotRequestAuth } from "@/lib/discord-auth";
import { closeExpiredRecruitmentsAndNotify } from "@/lib/notifications";

// Triggered on a short fixed interval (every 5 minutes) by the Discord bot's scheduler to proactively
// close recruitments whose response deadline has passed and DM the host. This is what makes the
// deadline-passed notification timely — without it, the host would only ever be notified whenever
// someone happened to open the event page after the deadline (see `ensureEventClosed`).
export async function POST(request: NextRequest) {
  if (!verifyBotRequestAuth(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await closeExpiredRecruitmentsAndNotify();
    return NextResponse.json(result);
  } catch (error) {
    console.error("Failed to run expired-recruitment check:", error);
    return NextResponse.json({ error: "締切超過チェックの実行に失敗しました" }, { status: 500 });
  }
}
