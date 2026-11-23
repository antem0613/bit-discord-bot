import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/discord-auth";
import { getCalendarDayData } from "@/lib/calendar";
import { jstToday, toDateKey } from "@/lib/calendar-grid";

export async function GET(request: NextRequest) {
  if (!(await getSession())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const dateParam = request.nextUrl.searchParams.get("date") ?? toDateKey(jstToday());

  const data = await getCalendarDayData(dateParam);

  return NextResponse.json(data);
}
