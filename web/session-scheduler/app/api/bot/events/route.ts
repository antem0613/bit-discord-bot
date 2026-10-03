import { NextRequest, NextResponse } from "next/server";
import { verifyBotRequestAuth } from "@/lib/discord-auth";
import { getFinalizedEventOccurrences } from "@/lib/calendar";
import { addDays } from "@/lib/calendar-grid";
import { EventValidationError, createEventRecord } from "@/lib/events";

type BotCreateEventBody = {
  creator?: { id?: string; username?: string; displayName?: string };
  title?: string;
  description?: string;
  candidateDates?: string[];
  schedulingDeadline?: string;
};

// Lists finalized events for the Discord bot's "/schedule list" command. `month` is required
// (1-12); `year` defaults to the current JST year; `day` (1-31) narrows the month down to one day.
// Unlike the website's calendar, any month/year (past or future) can be queried — there's no "current
// month..+12 months" clamp here.
export async function GET(request: NextRequest) {
  if (!verifyBotRequestAuth(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const params = request.nextUrl.searchParams;

  const monthParam = params.get("month");
  const month = monthParam ? Number(monthParam) : NaN;
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    return NextResponse.json({ error: "monthは1〜12の整数で指定してください" }, { status: 400 });
  }

  const yearParam = params.get("year");
  const year = yearParam ? Number(yearParam) : new Date().getUTCFullYear();
  if (!Number.isInteger(year)) {
    return NextResponse.json({ error: "yearは整数で指定してください" }, { status: 400 });
  }

  const dayParam = params.get("day");
  let day: number | null = null;
  let rangeStart: Date;
  let rangeEnd: Date;
  if (dayParam !== null) {
    day = Number(dayParam);
    if (!Number.isInteger(day) || day < 1 || day > 31) {
      return NextResponse.json({ error: "dayは1〜31の整数で指定してください" }, { status: 400 });
    }
    rangeStart = new Date(Date.UTC(year, month - 1, day));
    if (rangeStart.getUTCMonth() !== month - 1) {
      return NextResponse.json({ error: "指定された日付は存在しません" }, { status: 400 });
    }
    rangeEnd = addDays(rangeStart, 1);
  } else {
    rangeStart = new Date(Date.UTC(year, month - 1, 1));
    rangeEnd = new Date(Date.UTC(year, month, 1));
  }

  const events = await getFinalizedEventOccurrences(rangeStart, rangeEnd);
  return NextResponse.json({ year, month, day, events });
}

// Lets the Discord bot's "/schedule create" modal create an event on behalf of whichever member
// submitted it, without that member ever having logged into the website.
export async function POST(request: NextRequest) {
  if (!verifyBotRequestAuth(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: BotCreateEventBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "リクエストの形式が正しくありません" }, { status: 400 });
  }

  const creator = body.creator;
  if (!creator?.id || !creator.username) {
    return NextResponse.json({ error: "creator情報が不足しています" }, { status: 400 });
  }

  try {
    const event = await createEventRecord({
      creatorId: creator.id,
      creatorUsername: creator.username,
      creatorDisplayName: creator.displayName || creator.username,
      title: String(body.title ?? ""),
      description: String(body.description ?? ""),
      candidateDateStrings: Array.isArray(body.candidateDates) ? body.candidateDates.map(String) : [],
      schedulingDeadlineRaw: String(body.schedulingDeadline ?? ""),
    });

    return NextResponse.json({ id: event.id, url: `${request.nextUrl.origin}/events/${event.id}` });
  } catch (error) {
    if (error instanceof EventValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error("Failed to create event via bot API:", error);
    return NextResponse.json({ error: "イベントの作成に失敗しました" }, { status: 500 });
  }
}
