import Image from "next/image";
import Link from "next/link";
import { LogOut, Settings } from "lucide-react";
import { avatarUrlFor, getSession } from "@/lib/discord-auth";

export default async function SiteHeader() {
  const user = await getSession();

  return (
    <header className="sticky top-0 z-30 border-b border-line bg-background/85 backdrop-blur">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center gap-3 px-4 sm:px-6">
        <Link href="/" className="flex min-w-0 items-center gap-2.5">
          <Image src="/kusozako_icon.png" alt="" width={36} height={36} className="rounded-full" />
          <span className="flex min-w-0 flex-col leading-tight">
            <span className="truncate text-[15px] font-bold">クソザコダイス君</span>
            <span className="text-[11px] text-muted">日程調整</span>
          </span>
        </Link>

        <div className="ml-auto flex items-center gap-2 text-sm">
          {user ? (
            <>
              <span className="hidden items-center gap-2 rounded-full bg-surface-3 py-1 pr-3 pl-1 sm:flex">
                <Image src={avatarUrlFor(user)} alt="" width={24} height={24} className="size-6 rounded-full bg-surface" />
                <span className="max-w-40 truncate font-medium">{user.displayName}</span>
              </span>
              <Image src={avatarUrlFor(user)} alt={user.displayName} width={32} height={32} className="size-8 rounded-full bg-surface sm:hidden" />
              <Link href="/settings" className="btn-ghost px-3" title="設定・カレンダー連携">
                <Settings className="size-4" />
                <span className="hidden md:inline">設定</span>
              </Link>
              <form action="/api/auth/logout" method="post">
                <button type="submit" className="btn-ghost px-3" title="ログアウト">
                  <LogOut className="size-4" />
                  <span className="hidden sm:inline">ログアウト</span>
                </button>
              </form>
            </>
          ) : null}
        </div>
      </div>
    </header>
  );
}
