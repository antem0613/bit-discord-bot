import { fetchGuildMembers, getSession, type GuildMemberSummary } from "@/lib/discord-auth";
import { toDateTimeLocalMin } from "@/lib/events";
import CreateEventForm from "@/app/components/CreateEventForm";

const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export default async function NewEventPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const [user, { date }] = await Promise.all([getSession(), searchParams]);
  const initialDates = date && DATE_KEY_PATTERN.test(date) ? [date] : [];

  if (!user) {
    return (
      <div className="mx-auto w-full max-w-xl p-8">
        <p>イベントを作成するにはログインが必要です。</p>
        <a href="/api/auth/login" className="text-blue-600 underline">
          Discordでログイン
        </a>
      </div>
    );
  }

  // The participant picker is a nice-to-have: if the bot can't list guild members (e.g. missing
  // privileged intent, bot token, or a transient API error), the form still renders without it.
  let guildMembers: GuildMemberSummary[] = [];
  try {
    guildMembers = (await fetchGuildMembers()).filter((m) => m.id !== user.id);
  } catch (error) {
    console.error("Failed to fetch guild members for participant picker:", error);
  }

  return (
    <div className="mx-auto w-full max-w-2xl p-8">
      <h1 className="mb-6 text-2xl font-semibold">イベントを作成</h1>
      <CreateEventForm deadlineMin={toDateTimeLocalMin()} initialDates={initialDates} guildMembers={guildMembers} />
    </div>
  );
}
