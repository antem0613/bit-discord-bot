import { NextRequest, NextResponse } from "next/server";
import { getCalendarDayData } from "@/lib/calendar";
import { jstToday, toDateKey } from "@/lib/calendar-grid";

export async function GET(request: NextRequest) {
  const dateParam = request.nextUrl.searchParams.get("date") ?? toDateKey(jstToday());

  const data = await getCalendarDayData(dateParam);

  return NextResponse.json(data);
}
