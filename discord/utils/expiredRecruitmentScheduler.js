// Dependency-free fixed-interval scheduler for the "recruitment deadline passed" check. Unlike the
// daily reminder scheduler (which targets a specific time of day), this just needs to run repeatedly
// on a short interval, so it's a plain setInterval with no delay-until-next-run calculation.
const CHECK_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

async function runExpiredRecruitmentCheck() {
    const baseUrl = process.env.SCHEDULER_BASE_URL;
    const secret = process.env.BOT_EVENTS_SECRET;
    if (!baseUrl || !secret) {
        console.error('[reminder] SCHEDULER_BASE_URL or BOT_EVENTS_SECRET is not set; skipping expired-recruitment check.');
        return;
    }

    try {
        const res = await fetch(`${baseUrl}/api/bot/reminders/expired-recruitment`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${secret}` },
        });
        const data = await res.json().catch(() => null);
        if (!res.ok) {
            console.error(`[reminder] expired-recruitment check request failed: ${res.status}`, data);
            return;
        }
        if (data?.closedEvents?.length > 0) {
            console.log('[reminder] expired-recruitment check closed events:', data);
        }
    } catch (error) {
        console.error('[reminder] Failed to call the expired-recruitment check API:', error);
    }
}

// Starts the recurring (every 5 minutes) "recruitment deadline passed" check, so the host is notified
// promptly instead of only when someone happens to open the event page after the deadline. Call once
// at bot startup.
export function startExpiredRecruitmentScheduler() {
    console.log(`[reminder] Expired-recruitment check running every ${CHECK_INTERVAL_MS / 60000} minute(s).`);
    runExpiredRecruitmentCheck();
    setInterval(runExpiredRecruitmentCheck, CHECK_INTERVAL_MS);
}
