import { getSession } from "@/lib/discord-auth";
import { toDateTimeLocalMin } from "@/lib/events";
import CreateEventForm from "@/app/components/CreateEventForm";

export default async function NewEventPage() {
  const user = await getSession();

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

  return (
    <div className="mx-auto w-full max-w-2xl p-8">
      <h1 className="mb-6 text-2xl font-semibold">イベントを作成</h1>
      <CreateEventForm deadlineMin={toDateTimeLocalMin()} />
    </div>
  );
}
