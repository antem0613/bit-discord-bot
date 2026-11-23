import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/discord-auth";
import { getCalendarMonthData } from "@/lib/calendar";
import { jstToday } from "@/lib/calendar-grid";

export async function GET(request: NextRequest) {
  if (!(await getSession())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const now = jstToday();
  const yParam = request.nextUrl.searchParams.get("y");
  const mParam = request.nextUrl.searchParams.get("m");

  const requestedYear = yParam ? Number(yParam) : now.getUTCFullYear();
  const requestedMonth = mParam ? Number(mParam) - 1 : now.getUTCMonth();

  const data = await getCalendarMonthData(
    Number.isFinite(requestedYear) ? requestedYear : now.getUTCFullYear(),
    Number.isFinite(requestedMonth) ? requestedMonth : now.getUTCMonth()
  );

  return NextResponse.json(data);
}
