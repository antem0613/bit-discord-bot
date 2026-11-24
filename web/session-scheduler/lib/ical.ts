// Personal iCalendar (RFC 5545) feed: the finalized events a member takes part in.
import { AvailabilitySymbol, SchedulingStatus } from "@/app/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { addDays, jstToday, toDateKey } from "@/lib/calendar-grid";
import { ROOM_LABELS } from "@/lib/event-constants";

// Past events kept in the feed so recently finished sessions don't vanish from calendars at once.
const PAST_DAYS = 30;
// Used for DTEND when only a start time was set.
const DEFAULT_DURATION_HOURS = 1;
const PRODID = "-//B.I.T//Kusozako Dice Scheduler//JA";

// Lines in the feed (before folding). Japan has no DST, so a fixed +09:00 VTIMEZONE is exact.
const VTIMEZONE = [
  "BEGIN:VTIMEZONE",
  "TZID:Asia/Tokyo",
  "BEGIN:STANDARD",
  "DTSTART:19700101T000000",
  "TZOFFSETFROM:+0900",
  "TZOFFSETTO:+0900",
  "TZNAME:JST",
  "END:STANDARD",
  "END:VTIMEZONE",
];

function escapeText(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

// Folds a content line to <= 75 octets per line (UTF-8), never splitting a character.
function fold(line: string): string {
  const out: string[] = [];
  let current = "";
  let bytes = 0;
  for (const ch of line) {
    const size = Buffer.byteLength(ch, "utf8");
    const limit = out.length === 0 ? 75 : 74; // continuation lines start with a space
    if (bytes + size > limit) {
      out.push(current);
      current = "";
      bytes = 0;
    }
    current += ch;
    bytes += size;
  }
  out.push(current);
  return out.join("\r\n ");
}

const compactDate = (dateKey: string) => dateKey.replace(/-/g, "");
const compactTime = (hhmm: string) => `${hhmm.replace(":", "")}00`;

function utcStamp(date: Date): string {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

// "2026-12-03" + "20:00" → local date/time parts, shifted by `addMinutes` (may roll over days).
function shift(dateKey: string, hhmm: string, addMinutes: number): { date: string; time: string } {
  const [h, m] = hhmm.split(":").map(Number);
  const base = new Date(`${dateKey}T00:00:00.000Z`);
  base.setUTCMinutes(h * 60 + m + addMinutes);
  const iso = base.toISOString();
  return { date: iso.slice(0, 10), time: iso.slice(11, 16) };
}

type FeedEntry = {
  uid: string;
  dateKey: string;
  startTime: string | null;
  endTime: string | null;
  title: string;
  description: string;
  location: string | null;
  url: string;
  cancelled: boolean;
  lastModified: Date;
};

function eventLines(e: FeedEntry, now: Date): string[] {
  const lines = ["BEGIN:VEVENT", `UID:${e.uid}`, `DTSTAMP:${utcStamp(now)}`, `LAST-MODIFIED:${utcStamp(e.lastModified)}`];

  if (e.startTime) {
    lines.push(`DTSTART;TZID=Asia/Tokyo:${compactDate(e.dateKey)}T${compactTime(e.startTime)}`);
    let end: { date: string; time: string };
    if (e.endTime) {
      // An end at or before the start means the session runs past midnight.
      end = { date: e.endTime > e.startTime ? e.dateKey : toDateKey(addDays(new Date(`${e.dateKey}T00:00:00.000Z`), 1)), time: e.endTime };
    } else {
      end = shift(e.dateKey, e.startTime, DEFAULT_DURATION_HOURS * 60);
    }
    lines.push(`DTEND;TZID=Asia/Tokyo:${compactDate(end.date)}T${compactTime(end.time)}`);
  } else {
    const next = toDateKey(addDays(new Date(`${e.dateKey}T00:00:00.000Z`), 1));
    lines.push(`DTSTART;VALUE=DATE:${compactDate(e.dateKey)}`, `DTEND;VALUE=DATE:${compactDate(next)}`);
  }

  lines.push(`SUMMARY:${escapeText(e.title)}`);
  const description = [e.description, e.url].filter(Boolean).join("\n\n");
  if (description) lines.push(`DESCRIPTION:${escapeText(description)}`);
  if (e.location) lines.push(`LOCATION:${escapeText(e.location)}`);
  lines.push(`URL:${e.url}`);
  lines.push(`STATUS:${e.cancelled ? "CANCELLED" : "CONFIRMED"}`);
  lines.push("TRANSP:OPAQUE", "END:VEVENT");
  return lines;
}

// Builds the feed for `memberId`: finalized (or since-cancelled) events they created, were named as a
// participant in, or answered — skipping individual dates they explicitly answered × for.
export async function buildMemberFeed(memberId: string, siteBaseUrl: string): Promise<string> {
  const from = addDays(jstToday(), -PAST_DAYS);
  const events = await prisma.event.findMany({
    where: {
      status: { in: [SchedulingStatus.FINALIZED, SchedulingStatus.CANCELLED] },
      finalDates: { some: { date: { gte: from } } },
      OR: [
        { creatorId: memberId },
        { participants: { some: { memberId } } },
        { responses: { some: { memberId } } },
      ],
    },
    include: {
      finalDates: { where: { date: { gte: from } }, orderBy: { date: "asc" } },
      candidateDates: { select: { date: true, responses: { where: { memberId }, select: { symbol: true } } } },
    },
  });

  const now = new Date();
  const entries: FeedEntry[] = [];
  for (const event of events) {
    const isCreator = event.creatorId === memberId;
    const mySymbolByDate = new Map(
      event.candidateDates.map((c) => [toDateKey(c.date), c.responses[0]?.symbol ?? null])
    );
    for (const f of event.finalDates) {
      const dateKey = toDateKey(f.date);
      if (!isCreator && mySymbolByDate.get(dateKey) === AvailabilitySymbol.CROSS) continue;
      entries.push({
        uid: `${event.id}-${dateKey}@bit-scheduler`,
        dateKey,
        startTime: f.startTime,
        endTime: f.endTime,
        title: event.title,
        description: event.description,
        location: f.room ? ROOM_LABELS[f.room] : null,
        url: `${siteBaseUrl}/events/${event.id}`,
        cancelled: event.status === SchedulingStatus.CANCELLED,
        lastModified: event.updatedAt,
      });
    }
  }
  entries.sort((a, b) => (a.dateKey + (a.startTime ?? "")).localeCompare(b.dateKey + (b.startTime ?? "")));

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    `PRODID:${PRODID}`,
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeText("B.I.T 参加予定")}`,
    "X-WR-TIMEZONE:Asia/Tokyo",
    // Hints for clients that honour them (Google Calendar ignores these and polls on its own schedule).
    "REFRESH-INTERVAL;VALUE=DURATION:PT1H",
    "X-PUBLISHED-TTL:PT1H",
    ...VTIMEZONE,
    ...entries.flatMap((e) => eventLines(e, now)),
    "END:VCALENDAR",
  ];
  return lines.map(fold).join("\r\n") + "\r\n";
}
