// Dependency-free daily scheduler for the "day-before" event reminder check. Rather than pulling in a
// cron library, this just computes the delay until the next 08:00 JST and uses setTimeout/setInterval —
// good enough for a single fixed daily time and consistent with this bot's otherwise minimal footprint.
const JST_OFFSET_MS = 9 * 60 * 60 * 1000; // Japan has no DST, so a fixed UTC+9 offset is always correct.
const TARGET_HOUR_JST = 8;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

function msUntilNextRun() {
    const now = new Date();
    const jstNow = new Date(now.getTime() + JST_OFFSET_MS);
    const target = new Date(Date.UTC(
        jstNow.getUTCFullYear(),
        jstNow.getUTCMonth(),
        jstNow.getUTCDate(),
        TARGET_HOUR_JST, 0, 0, 0
    ));
    if (target.getTime() <= jstNow.getTime()) {
        target.setUTCDate(target.getUTCDate() + 1);
    }
    return target.getTime() - jstNow.getTime();
}

async function runDayBeforeReminders() {
    const baseUrl = process.env.SCHEDULER_BASE_URL;
    const secret = process.env.BOT_EVENTS_SECRET;
    if (!baseUrl || !secret) {
        console.error('[reminder] SCHEDULER_BASE_URL or BOT_EVENTS_SECRET is not set; skipping day-before reminder check.');
        return;
    }

    try {
        const res = await fetch(`${baseUrl}/api/bot/reminders/day-before`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${secret}` },
        });
        const data = await res.json().catch(() => null);
        if (!res.ok) {
            console.error(`[reminder] day-before reminder request failed: ${res.status}`, data);
            return;
        }
        console.log('[reminder] day-before reminders run:', data);
    } catch (error) {
        console.error('[reminder] Failed to call the day-before reminder API:', error);
    }
}

// Starts the daily (08:00 JST) "day-before" event reminder check. Call once at bot startup.
export function startDailyReminderScheduler() {
    const delay = msUntilNextRun();
    console.log(`[reminder] Next day-before reminder check in ${Math.round(delay / 60000)} minute(s) (08:00 JST daily).`);
    setTimeout(() => {
        runDayBeforeReminders();
        setInterval(runDayBeforeReminders, ONE_DAY_MS);
    }, delay);
}
