import Image from "next/image";
import { redirect } from "next/navigation";
import { Lock, TriangleAlert } from "lucide-react";
import { getSession } from "@/lib/discord-auth";
import { safeNextPath } from "@/lib/session-token";
import { isMockAuthEnabled } from "@/lib/mock-auth";

const MOCK_USERS = [
  { user: "alice", name: "テスト主催者アリス" },
  { user: "bob", name: "テスト参加者ボブ" },
];

const ERROR_MESSAGES: Record<string, string> = {
  not_member: "このページは B.I.T の Discord サーバーに参加しているメンバーのみ利用できます。",
  invalid_state: "ログインに失敗しました。もう一度お試しください。",
  login_failed: "ログイン処理中にエラーが発生しました。",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const [user, { error, next }] = await Promise.all([getSession(), searchParams]);
  const nextPath = safeNextPath(next);

  // Already signed in (and the proxy has let the session through): skip the login screen.
  if (user && !error) redirect(nextPath);

  const loginHref = nextPath === "/" ? "/api/auth/login" : `/api/auth/login?next=${encodeURIComponent(nextPath)}`;

  return (
    <div className="mx-auto flex w-full max-w-md flex-col px-4 py-16 sm:py-24">
      <div className="card flex flex-col items-center gap-5 p-8 text-center">
        <Image src="/kusozako_icon.png" alt="" width={72} height={72} className="rounded-full" />
        <div>
          <h1 className="text-xl font-bold">日程調整にログイン</h1>
          <p className="mt-2 text-sm text-muted">
            総合創作サークル B.I.T の Discord サーバーのメンバー専用です。
            <br />
            Discord アカウントでログインしてください。
          </p>
        </div>

        {error && ERROR_MESSAGES[error] && (
          <p className="flex w-full items-start gap-2 rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-left text-sm text-danger">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" />
            {ERROR_MESSAGES[error]}
          </p>
        )}

        <a href={loginHref} className="btn-primary w-full py-3 text-base">
          <svg viewBox="0 0 24 24" aria-hidden className="size-5 fill-current">
            <path d="M20.317 4.37a19.79 19.79 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.74 19.74 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.1 13.1 0 0 1-1.872-.892.077.077 0 0 1-.008-.128c.126-.094.252-.192.372-.292a.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.3 12.3 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.84 19.84 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
          </svg>
          Discordでログイン
        </a>

        <p className="flex items-center gap-1.5 text-xs text-subtle">
          <Lock className="size-3.5" />
          表示名・アイコン・サーバー参加状況のみ取得します
        </p>

        {isMockAuthEnabled() && (
          <div className="w-full rounded-xl border border-dashed border-amber-500/50 bg-amber-500/10 p-4 text-left">
            <p className="mb-2 text-xs font-bold text-amber-700 dark:text-amber-300">開発用モックログイン（MOCK_AUTH=1）</p>
            <div className="flex flex-wrap gap-2">
              {MOCK_USERS.map((m) => (
                <a
                  key={m.user}
                  href={`/api/auth/mock?user=${m.user}&name=${encodeURIComponent(m.name)}&next=${encodeURIComponent(nextPath)}`}
                  className="btn-secondary px-3 py-1.5 text-xs"
                >
                  {m.name}
                </a>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
