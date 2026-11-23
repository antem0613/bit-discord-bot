import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { fetchGuildMembers, getSession, type GuildMemberSummary } from "@/lib/discord-auth";
import { toDateTimeLocalMin } from "@/lib/events";
import CreateEventForm from "@/app/components/CreateEventForm";
import Notice from "@/app/components/Notice";

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
      <Notice
        message="イベントを作成するにはログインが必要です。"
        action={
          <a href="/api/auth/login" className="btn-primary">
            Discordでログイン
          </a>
        }
      />
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
    <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6">
      <Link href="/" className="btn-ghost -ml-3 mb-2">
        <ArrowLeft className="size-4" />
        カレンダー
      </Link>
      <h1 className="mb-5 text-2xl font-bold sm:text-3xl">イベントを作成</h1>
      <CreateEventForm deadlineMin={toDateTimeLocalMin()} initialDates={initialDates} guildMembers={guildMembers} />
    </div>
  );
}
