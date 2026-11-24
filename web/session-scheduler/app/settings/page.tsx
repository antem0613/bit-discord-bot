import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { ArrowLeft, CalendarSync, CircleCheck, ExternalLink, Info, KeyRound } from "lucide-react";
import { getSession } from "@/lib/discord-auth";
import { prisma } from "@/lib/prisma";
import { issueIcalToken, revokeIcalToken } from "@/app/actions/ical";
import { siteBaseUrlFromHeaders } from "@/lib/site-url";
import CopyField from "@/app/components/CopyField";
import { ConfirmSubmitButton } from "@/app/components/ConfirmDialog";

const NOTICES: Record<string, string> = {
  issued: "カレンダー連携用の URL を発行しました。",
  revoked: "カレンダー連携を停止しました。以前の URL は使えません。",
};

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ notice?: string }> }) {
  const [user, { notice }, h] = await Promise.all([getSession(), searchParams, headers()]);
  if (!user) redirect("/login?next=/settings");

  const member = await prisma.member.findUnique({ where: { id: user.id }, select: { icalToken: true } });
  const token = member?.icalToken ?? null;
  const feedUrl = token ? `${siteBaseUrlFromHeaders(h)}/api/ical/${token}.ics` : null;
  const webcalUrl = feedUrl?.replace(/^https?:\/\//, "webcal://") ?? null;
  const googleUrl = webcalUrl ? `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(webcalUrl)}` : null;

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-6 sm:px-6">
      <Link href="/" className="btn-ghost -ml-3 mb-2">
        <ArrowLeft className="size-4" />
        カレンダー
      </Link>
      <h1 className="mb-5 text-2xl font-bold sm:text-3xl">設定</h1>

      {notice && NOTICES[notice] && (
        <p className="mb-4 flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-300">
          <CircleCheck className="size-4 shrink-0" />
          {NOTICES[notice]}
        </p>
      )}

      <section className="card p-5 sm:p-6">
        <h2 className="flex items-center gap-2 text-lg font-bold">
          <CalendarSync className="size-5 text-brand" />
          カレンダーアプリと連携
        </h2>
        <p className="mt-1 text-sm text-muted">
          あなたが参加する確定済みの予定（作成したもの・参加者に指定されたもの・回答したもの）を、Google カレンダーなどに自動で表示できます。×と回答した日は含まれません。
        </p>

        {feedUrl ? (
          <div className="mt-5 flex flex-col gap-4">
            <CopyField value={feedUrl} label="カレンダー連携用 URL" />
            <div className="flex flex-wrap gap-2">
              {googleUrl && (
                <a href={googleUrl} target="_blank" rel="noreferrer" className="btn-primary">
                  Googleカレンダーに追加
                  <ExternalLink className="size-4" />
                </a>
              )}
              {webcalUrl && (
                <a href={webcalUrl} className="btn-secondary">
                  Apple カレンダー / Outlook で開く
                </a>
              )}
            </div>

            <ul className="flex flex-col gap-1.5 rounded-xl bg-surface-2 p-4 text-xs text-muted">
              <li className="flex gap-2">
                <Info className="mt-0.5 size-3.5 shrink-0" />
                Google カレンダーは数時間〜1日おきに更新を取りに来るため、変更の反映には時間がかかります。
              </li>
              <li className="flex gap-2">
                <KeyRound className="mt-0.5 size-3.5 shrink-0" />
                この URL を知っている人は誰でもあなたの参加予定を見られます。他人に教えないでください。漏れた場合は再発行してください。
              </li>
            </ul>

            <div className="flex flex-wrap gap-2 border-t border-line pt-4">
              <ConfirmSubmitButton
                action={issueIcalToken}
                className="btn-secondary"
                title="URL を再発行しますか？"
                message="今の URL は使えなくなります。カレンダーアプリには新しい URL を登録し直してください。"
                confirmLabel="再発行する"
              >
                URL を再発行
              </ConfirmSubmitButton>
              <ConfirmSubmitButton
                action={revokeIcalToken}
                className="btn-danger"
                danger
                title="カレンダー連携を停止しますか？"
                message="今の URL は使えなくなり、カレンダーアプリの予定も更新されなくなります。"
                confirmLabel="停止する"
              >
                連携を停止
              </ConfirmSubmitButton>
            </div>
          </div>
        ) : (
          <form action={issueIcalToken} className="mt-5">
            <button type="submit" className="btn-primary">
              <CalendarSync className="size-4" />
              連携用の URL を発行する
            </button>
          </form>
        )}
      </section>
    </div>
  );
}
