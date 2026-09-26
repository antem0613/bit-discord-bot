import { NextRequest, NextResponse } from "next/server";
import { getCalendarMonthData } from "@/lib/calendar";

export async function GET(request: NextRequest) {
  const now = new Date();
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
