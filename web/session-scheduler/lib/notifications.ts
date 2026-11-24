// Best-effort Discord DM notifications sent via the bot token (plain REST calls, no gateway
// connection needed). Every exported "notify*"/"run*" function here swallows its own errors (logging
// instead) so a Discord-side failure (DMs disabled, rate limit, missing env var, ...) never breaks the
// surrounding event-creation/reschedule flow or the day-before reminder batch run.
import { AvailabilitySymbol, SchedulingStatus } from "@/app/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { addDays, jstToday } from "@/lib/calendar-grid";
import { ROOM_LABELS, formatTimeRange } from "@/lib/event-constants";
import { MOCK_ID_PREFIX } from "@/lib/mock-auth";
import { formatShortDate } from "@/lib/ui-styles";
import dayjs from "@/lib/dayjs";

const DISCORD_API = "https://discord.com/api/v10";
const USER_AGENT = "DiscordBot (https://github.com/antem0613/bit-discord-bot, 1.0)";

// Builds the public event URL for a DM, or null (omitted from the message) if SITE_BASE_URL isn't set.
function siteEventUrl(eventId: string): string | null {
  const base = process.env.SITE_BASE_URL?.trim();
  if (!base) {
    console.error("[notifications] Missing SITE_BASE_URL env var; omitting event link from DM.");
    return null;
  }
  const withScheme = /^https?:\/\//i.test(base) ? base : `http://${base}`;
  return `${withScheme.replace(/\/+$/, "")}/events/${eventId}`;
}

// Embed accent colors (Discord-style palette).
const COLORS = {
  info: 0x5865f2, // blurple: new info / please answer
  success: 0x23a55a, // green: confirmed
  warning: 0xf0b232, // amber: changes, reminders
  muted: 0x80848e, // grey: closed
} as const;

// One DM: shown as an embed with an optional link button to the event page.
export type DirectMessage = {
  title: string; // also used as the plain-text preview in push notifications
  description?: string;
  fields?: { name: string; value: string }[];
  color?: number;
  url?: string | null;
  buttonLabel?: string;
};

// Discord message payload for a DirectMessage. Exported for tests.
export function buildDirectMessagePayload(msg: DirectMessage, { withButton = true } = {}) {
  const embed = {
    title: msg.title.slice(0, 256),
    ...(msg.description ? { description: msg.description.slice(0, 4096) } : {}),
    ...(msg.url ? { url: msg.url } : {}),
    color: msg.color ?? COLORS.info,
    ...(msg.fields?.length
      ? { fields: msg.fields.slice(0, 25).map((f) => ({ name: f.name.slice(0, 256), value: f.value.slice(0, 1024) })) }
      : {}),
    footer: { text: "クソザコダイス君 日程調整" },
  };
  const components =
    withButton && msg.url
      ? [{ type: 1, components: [{ type: 2, style: 5, label: (msg.buttonLabel ?? "イベントを開く").slice(0, 80), url: msg.url }] }]
      : [];
  return { content: msg.title.slice(0, 2000), embeds: [embed], components };
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
async function sendDirectMessage(userId: string, msg: DirectMessage): Promise<void> {
  // Mock-login test users (lib/mock-auth.ts) aren't real Discord accounts.
  if (userId.startsWith(MOCK_ID_PREFIX)) {
    console.log(`[notifications] Skipping DM to mock user ${userId}: ${msg.title}`);
    return;
  }
  try {
    const botToken = process.env.DISCORD_BOT_TOKEN;
    if (!botToken) {
      console.error("[notifications] Missing DISCORD_BOT_TOKEN env var; cannot send DM.");
      return;
    }

    const channelId = await openDmChannel(userId, botToken);
    if (!channelId) return;

    const post = (withButton: boolean) =>
      fetch(`${DISCORD_API}/channels/${channelId}/messages`, {
        method: "POST",
        headers: {
          Authorization: `Bot ${botToken}`,
          "Content-Type": "application/json",
          "User-Agent": USER_AGENT,
        },
        body: JSON.stringify(buildDirectMessagePayload(msg, { withButton })),
      });

    let res = await post(true);
    // Discord rejects link buttons whose URL it considers invalid (400). The embed still carries the
    // link, so retry once without the button rather than dropping the notification.
    if (res.status === 400 && msg.url) {
      console.error(`[notifications] DM with link button rejected for user ${userId}; retrying without button.`);
      res = await post(false);
    }
    if (!res.ok) {
      console.error(`[notifications] Failed to send DM to user ${userId}: ${res.status}`);
    }
  } catch (error) {
    console.error(`[notifications] Error sending DM to user ${userId}:`, error);
  }
}

async function sendDirectMessages(userIds: string[], msg: DirectMessage): Promise<void> {
  await Promise.all(userIds.map((id) => sendDirectMessage(id, msg)));
}

// Notifies members freshly pre-set as participants at event-creation time (see `EventParticipant`).
// Not used for reschedule-carried-over participants; those get `notifyEventRescheduled` instead.
export async function notifyParticipantsAdded(eventId: string, title: string, memberIds: string[]): Promise<void> {
  if (memberIds.length === 0) return;
  await sendDirectMessages(memberIds, {
    title: `「${title}」の参加者に登録されました`,
    description: "候補日への回答をお願いします。",
    color: COLORS.info,
    url: siteEventUrl(eventId),
    buttonLabel: "回答する",
  });
}

// Notifies everyone participating in an event (pre-set participants + prior responders, both already
// carried over into `EventParticipant` by `rescheduleEvent`) that it has been rescheduled.
export async function notifyEventRescheduled(eventId: string, title: string, memberIds: string[]): Promise<void> {
  if (memberIds.length === 0) return;
  await sendDirectMessages(memberIds, {
    title: `「${title}」の日程が再調整されました`,
    description: "新しい候補日への回答をお願いします。",
    color: COLORS.warning,
    url: siteEventUrl(eventId),
    buttonLabel: "回答する",
  });
}

// Notifies the host when their event's response period closed automatically because its deadline
// passed (see `ensureEventClosed`) — as opposed to a manual close they triggered themselves via the
// "参加受付を締め切る" button, which they're already aware of and don't need a DM for.
export async function notifyRecruitmentAutoClosed(eventId: string, title: string, hostId: string): Promise<void> {
  await sendDirectMessages([hostId], {
    title: `「${title}」の募集が締め切られました`,
    description: "回答期限を過ぎたため、自動的に受付を終了しました。実施日を決定してください。",
    color: COLORS.muted,
    url: siteEventUrl(eventId),
    buttonLabel: "実施日を決める",
  });
}

// Notifies everyone who engaged with the event (answered any candidate date, or was pre-set/carried-
// over as an `EventParticipant`) once its schedule is finalized, with the title and the list of
// execution dates added to the calendar.
export async function notifyEventFinalized(
  eventId: string,
  title: string,
  finalDates: FinalDateSummary[],
  memberIds: string[]
): Promise<void> {
  if (memberIds.length === 0) return;
  await sendDirectMessages(memberIds, {
    title: `「${title}」の日程が確定しました`,
    fields: [{ name: "実施日", value: finalDates.map((f) => `・${formatFinalDateLine(f)}`).join("\n") }],
    color: COLORS.success,
    url: siteEventUrl(eventId),
  });
}

export type FinalDateSummary = { date: string; startTime: string | null; endTime: string | null; room: string | null };

// "12/1(火) 20:00〜23:00 セッション部屋１"
export function formatFinalDateLine(f: FinalDateSummary): string {
  const time = formatTimeRange(f.startTime, f.endTime);
  const room = f.room ? ROOM_LABELS[f.room as keyof typeof ROOM_LABELS] : "";
  return [formatShortDate(f.date), time, room].filter(Boolean).join(" ");
}

// Sent when the host edits a confirmed event's time/room so participants aren't left with stale info.
export async function notifyFinalDatesChanged(
  eventId: string,
  title: string,
  finalDates: FinalDateSummary[],
  memberIds: string[]
): Promise<void> {
  if (memberIds.length === 0) return;
  await sendDirectMessages(memberIds, {
    title: `「${title}」の時間・場所が変更されました`,
    fields: [{ name: "変更後の実施日", value: finalDates.map((f) => `・${formatFinalDateLine(f)}`).join("\n") }],
    color: COLORS.warning,
    url: siteEventUrl(eventId),
  });
}

// Sent when the host adds candidate dates to an event that is still collecting answers.
export async function notifyCandidatesAdded(
  eventId: string,
  title: string,
  addedDateKeys: string[],
  memberIds: string[]
): Promise<void> {
  if (memberIds.length === 0 || addedDateKeys.length === 0) return;
  await sendDirectMessages(memberIds, {
    title: `「${title}」に候補日が追加されました`,
    description: "追加された日への回答をお願いします。",
    fields: [{ name: "追加された候補日", value: addedDateKeys.map(formatShortDate).join("、") }],
    color: COLORS.info,
    url: siteEventUrl(eventId),
    buttonLabel: "回答する",
  });
}

// Host-triggered nudge to participants who haven't answered every candidate date yet.
export async function notifyResponseReminder(
  eventId: string,
  title: string,
  deadline: Date | null,
  memberIds: string[]
): Promise<void> {
  if (memberIds.length === 0) return;
  await sendDirectMessages(memberIds, {
    title: `「${title}」の回答をお願いします`,
    description: "まだ回答していない候補日があります。",
    fields: deadline ? [{ name: "回答期限", value: dayjs(deadline).tz().format("M/D HH:mm") }] : [],
    color: COLORS.warning,
    url: siteEventUrl(eventId),
    buttonLabel: "回答する",
  });
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

    const details = [
      formatTimeRange(tomorrowFinal?.startTime, tomorrowFinal?.endTime),
      tomorrowFinal?.room ? ROOM_LABELS[tomorrowFinal.room] : "",
    ]
      .filter(Boolean)
      .join(" ");
    await sendDirectMessages(memberIds, {
      title: `明日は「${event.title}」の実施日です`,
      ...(details ? { fields: [{ name: "時間・場所", value: details }] } : {}),
      color: COLORS.success,
      url: siteEventUrl(event.id),
    });

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
