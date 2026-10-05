// Best-effort Discord DM notifications sent via the bot token (plain REST calls, no gateway
// connection needed). Every exported "notify*"/"run*" function here swallows its own errors (logging
// instead) so a Discord-side failure (DMs disabled, rate limit, missing env var, ...) never breaks the
// surrounding event-creation/reschedule flow or the day-before reminder batch run.
import { AvailabilitySymbol, SchedulingStatus } from "@/app/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { addDays, jstToday } from "@/lib/calendar-grid";
import { ROOM_LABELS } from "@/lib/event-constants";

const DISCORD_API = "https://discord.com/api/v10";
const USER_AGENT = "DiscordBot (https://github.com/antem0613/bit-discord-bot, 1.0)";

// Builds the public event URL for a DM, or null (omitted from the message) if SITE_BASE_URL isn't set.
function siteEventUrl(eventId: string): string | null {
  const base = process.env.SITE_BASE_URL;
  if (!base) {
    console.error("[notifications] Missing SITE_BASE_URL env var; omitting event link from DM.");
    return null;
  }
  return `${base.replace(/\/$/, "")}/events/${eventId}`;
}

async function openDmChannel(userId: string, botToken: string): Promise<string | null> {
  const res = await fetch(`${DISCORD_API}/users/@me/channels`, {
    method: "POST",
    headers: {
      Authorization: `Bot ${botToken}`,
      "Content-Type": "application/json",
      "User-Agent": USER_AGENT,
    },
    body: JSON.stringify({ recipient_id: userId }),
  });
  if (!res.ok) {
    console.error(`[notifications] Failed to open DM channel for user ${userId}: ${res.status}`);
    return null;
  }
  const data = (await res.json()) as { id: string };
  return data.id;
}

// Sends a single DM. Never throws: logs and returns on any failure (missing token, DMs disabled,
// user has no mutual server with the bot, rate limiting, ...).
async function sendDirectMessage(userId: string, content: string): Promise<void> {
  try {
    const botToken = process.env.DISCORD_BOT_TOKEN;
    if (!botToken) {
      console.error("[notifications] Missing DISCORD_BOT_TOKEN env var; cannot send DM.");
      return;
    }

    const channelId = await openDmChannel(userId, botToken);
    if (!channelId) return;

    const res = await fetch(`${DISCORD_API}/channels/${channelId}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bot ${botToken}`,
        "Content-Type": "application/json",
        "User-Agent": USER_AGENT,
      },
      body: JSON.stringify({ content }),
    });
    if (!res.ok) {
      console.error(`[notifications] Failed to send DM to user ${userId}: ${res.status}`);
    }
  } catch (error) {
    console.error(`[notifications] Error sending DM to user ${userId}:`, error);
  }
}

async function sendDirectMessages(userIds: string[], content: string): Promise<void> {
  await Promise.all(userIds.map((id) => sendDirectMessage(id, content)));
}

// Notifies members freshly pre-set as participants at event-creation time (see `EventParticipant`).
// Not used for reschedule-carried-over participants; those get `notifyEventRescheduled` instead.
export async function notifyParticipantsAdded(eventId: string, title: string, memberIds: string[]): Promise<void> {
  if (memberIds.length === 0) return;
  const url = siteEventUrl(eventId);
  const link = url ? `\n${url}` : "";
  await sendDirectMessages(memberIds, `「${title}」の参加者として登録されました。${link}`);
}

// Notifies everyone participating in an event (pre-set participants + prior responders, both already
// carried over into `EventParticipant` by `rescheduleEvent`) that it has been rescheduled.
export async function notifyEventRescheduled(eventId: string, title: string, memberIds: string[]): Promise<void> {
  if (memberIds.length === 0) return;
  const url = siteEventUrl(eventId);
  const link = url ? `\n${url}` : "";
  await sendDirectMessages(memberIds, `「${title}」の日程が再調整されました。新しい候補日への回答をお願いします。${link}`);
}

// Notifies the host when their event's response period closed automatically because its deadline
// passed (see `ensureEventClosed`) — as opposed to a manual close they triggered themselves via the
// "参加受付を締め切る" button, which they're already aware of and don't need a DM for.
export async function notifyRecruitmentAutoClosed(eventId: string, title: string, hostId: string): Promise<void> {
  const url = siteEventUrl(eventId);
  const link = url ? `\n${url}` : "";
  await sendDirectMessages([hostId], `「${title}」の参加者募集が、回答期限により自動的に終了しました。${link}`);
}

// Notifies everyone who engaged with the event (answered any candidate date, or was pre-set/carried-
// over as an `EventParticipant`) once its schedule is finalized, with the title and the list of
// execution dates added to the calendar.
export async function notifyEventFinalized(
  eventId: string,
  title: string,
  finalDateKeys: string[],
  memberIds: string[]
): Promise<void> {
  if (memberIds.length === 0) return;
  const url = siteEventUrl(eventId);
  const link = url ? `\n${url}` : "";
  const datesText = finalDateKeys.join("、");
  await sendDirectMessages(memberIds, `「${title}」の日程が確定しました。\n実施日: ${datesText}${link}`);
}

export type DayBeforeReminderResult = {
  checkedEvents: number;
  notifiedEvents: { eventId: string; title: string; memberCount: number }[];
};

// Finds finalized events whose execution date is "tomorrow" (JST) and DMs everyone who answered
// CIRCLE/TRIANGLE/UNKNOWN (i.e. anything but an explicit "can't attend") for that date. Only the first
// day of a consecutive multi-day run triggers a reminder (detected by "today" not also being one of the
// event's final dates), so an ongoing multi-day event doesn't re-ping people every day.
export async function runDayBeforeReminders(now = jstToday()): Promise<DayBeforeReminderResult> {
  const tomorrow = addDays(now, 1);

  const events = await prisma.event.findMany({
    where: { status: SchedulingStatus.FINALIZED, finalDates: { some: { date: tomorrow } } },
    include: {
      finalDates: true,
      candidateDates: { include: { responses: true } },
    },
  });

  const notifiedEvents: DayBeforeReminderResult["notifiedEvents"] = [];

  for (const event of events) {
    const isContinuationOfOngoingRun = event.finalDates.some((f) => f.date.getTime() === now.getTime());
    if (isContinuationOfOngoingRun) continue;

    const tomorrowFinal = event.finalDates.find((f) => f.date.getTime() === tomorrow.getTime());
    const tomorrowCandidate = event.candidateDates.find((c) => c.date.getTime() === tomorrow.getTime());

    const memberIds = Array.from(
      new Set(
        (tomorrowCandidate?.responses ?? [])
          .filter((r) => r.symbol !== AvailabilitySymbol.CROSS)
          .map((r) => r.memberId)
      )
    );
    if (memberIds.length === 0) continue;

    const roomSuffix = tomorrowFinal?.room ? `（${ROOM_LABELS[tomorrowFinal.room]}）` : "";
    const url = siteEventUrl(event.id);
    const link = url ? `\n${url}` : "";
    await sendDirectMessages(memberIds, `明日は「${event.title}」の実施日です${roomSuffix}。${link}`);

    notifiedEvents.push({ eventId: event.id, title: event.title, memberCount: memberIds.length });
  }

  return { checkedEvents: events.length, notifiedEvents };
}

export type ExpiredRecruitmentResult = {
  checkedEvents: number;
  closedEvents: { eventId: string; title: string }[];
};

// Proactively finds events whose response period (schedulingDeadline) has passed but are still open
// (status SCHEDULING, closedAt null), closes them, and DMs the host — unlike the lazy `ensureEventClosed`
// check (only triggered when someone happens to open the event page or respond to it), this runs on a
// fixed schedule (see the bot's scheduler) so the host is notified promptly even if nobody visits the
// page after the deadline passes.
//
// Each close is done via a conditional `updateMany` (matching `closedAt: null`) so that a concurrent
// `ensureEventClosed` call for the same event (triggered by someone opening the page at the same moment)
// can never result in the host being notified twice: whichever caller's write actually flips `closedAt`
// from null is the only one that sends the DM.
export async function closeExpiredRecruitmentsAndNotify(): Promise<ExpiredRecruitmentResult> {
  const now = new Date();

  const expired = await prisma.event.findMany({
    where: { status: SchedulingStatus.SCHEDULING, closedAt: null, schedulingDeadline: { lte: now } },
    select: { id: true, title: true, creatorId: true, schedulingDeadline: true },
  });

  const closedEvents: ExpiredRecruitmentResult["closedEvents"] = [];
  for (const event of expired) {
    const { count } = await prisma.event.updateMany({
      where: { id: event.id, closedAt: null },
      data: { closedAt: event.schedulingDeadline as Date },
    });
    if (count === 0) continue; // already closed by a concurrent check in the meantime

    await notifyRecruitmentAutoClosed(event.id, event.title, event.creatorId);
    closedEvents.push({ eventId: event.id, title: event.title });
  }

  return { checkedEvents: expired.length, closedEvents };
}
