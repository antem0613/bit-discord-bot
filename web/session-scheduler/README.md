This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Discordログイン設定

1. [Discord Developer Portal](https://discord.com/developers/applications) でアプリケーションを作成し、OAuth2の Redirect URL に `http://localhost:3000/api/auth/callback` を登録する。
2. `.env` に以下を設定する。
   - `DISCORD_CLIENT_ID` / `DISCORD_CLIENT_SECRET`: OAuth2の認証情報
   - `DISCORD_REDIRECT_URI`: 上記で登録したコールバックURL
   - `DISCORD_GUILD_ID`: ログインを許可するDiscordサーバー(ギルド)のID
   - `SESSION_SECRET`: セッションCookie署名用のランダムな文字列 (`openssl rand -hex 32` など)
3. ログインを許可されるのは `DISCORD_GUILD_ID` のサーバーメンバーのみで、表示名はそのサーバーのニックネーム（サーバープロフィール）を優先して使用する。

## イベント作成時の参加者あらかじめ設定（Bot経由のメンバー一覧取得）

イベント作成ページでは、Botトークンを使ってサーバーメンバー一覧を取得し、ホストが参加者を
あらかじめ選択できる。この機能を使うには以下の設定が必要。

1. `.env` に `DISCORD_BOT_TOKEN` を設定する（`discord/.env` の `TOKEN` と同じ値）。
2. [Discord Developer Portal](https://discord.com/developers/applications) の対象アプリケーションの
   **Bot > Privileged Gateway Intents** で **Server Members Intent** を有効にする。
   `GET /guilds/{guild.id}/members` （サーバーメンバー一覧取得）はこの特権インテントが
   有効になっていないと `403` で失敗する。

メンバー一覧の取得に失敗した場合（トークン未設定・インテント未有効化など）でも、
参加者の事前設定なしでイベント作成自体は継続できる。

## Discord Botコマンドからのイベント作成（`/schedule create`）

Discord Bot（`discord/`リポジトリ）の `/schedule create` コマンドから、サイトにログインしていない
メンバーでもイベントを作成できるよう、Bot専用の内部API `POST /api/bot/events` を公開している。

1. `.env` に `BOT_EVENTS_SECRET` を設定する（`discord/.env` の同名の値と一致させる、
   ランダムな文字列でよい）。
2. リクエストは `Authorization: Bearer <BOT_EVENTS_SECRET>` ヘッダーで認証する。一致しない場合は401。
3. 作成者の `Member` 行が未作成（サイト未ログイン）でも、リクエストに含まれる
   Discordプロフィール情報（ユーザー名・表示名）からその場で作成する。
4. 参加者の事前設定・回答記号ラベルのカスタマイズはこのAPI経由では行えない
   （作成後にサイト側で設定する）。

## Discord Botコマンドからのイベント一覧取得（`/schedule list`）

同じく `GET /api/bot/events`（`POST`とは別メソッド、同一パス）で、指定した月（または日）に
実施される確定済み（`FINALIZED`）イベントの一覧をBotへ返す。

- クエリパラメータ: `month`（1〜12、必須）、`year`（省略時は現在のUTC年）、`day`（1〜31、省略可）。
- サイトのカレンダー表示と異なり、年月の範囲制限（当月〜12ヶ月先）は設けていない
  （過去の月も問い合わせ可能）。
- レスポンスの各イベントには、部屋名はあらかじめ日本語ラベルに変換して含まれる
  （`roomLabel`）。キャンセル済みのイベントも `cancelled: true` 付きで含まれる
  （カレンダー表示と同様、除外はしない）。

## Discord Botコマンドからのイベント一覧取得（`/schedule recruiting` / `/schedule mine`）

- `GET /api/bot/events/recruiting`: 現在募集中（`status: SCHEDULING`、未締切、回答期限内、
  候補日がすべて過去でない）のイベント一覧を返す。
- `GET /api/bot/events/mine?userId=<DiscordユーザーID>`: 指定したユーザーが参加している
  （候補日に回答済み、または事前参加登録済み）`FINALIZED` イベントのうち、実施日
  （`EventFinalDate.date`）が今日（JST）以降のものだけを返す。`userId` は必須パラメータ。
- どちらも認証は他のBot用APIと同じ `Authorization: Bearer <BOT_EVENTS_SECRET>`。

## Discord DM通知

以下3つのタイミングで、Botトークンを使って対象のDiscordユーザーにDM（ダイレクトメッセージ）を
送信する（`lib/notifications.ts`）。いずれも送信失敗（DM拒否設定など）はログに記録されるのみで、
元の処理（イベント作成・リスケジュール・リマインダー実行）自体は継続する。

1. **参加者の事前登録時**: イベント作成時に参加者としてあらかじめ設定されたメンバーへ。
2. **リスケジュール時**: リスケジュールされたイベントの参加者（事前登録者＋前回の回答者）へ。
3. **前日リマインダー**: 確定済みイベントの実施日が「明日（日本時間）」になったとき、その日に
   〇・△・？で回答した人（×・未回答の人は含めない）へ。実施日が連続している場合は、
   その連続の最初の日の前日にのみ送る。
4. **募集の自動終了時**: 回答期限が過ぎて参加者募集が自動的に終了したとき、ホスト（作成者）へ。
   ホスト自身が「参加受付を締め切る」ボタンで手動終了した場合はDMを送らない（既に把握しているため）。
5. **日程確定時**: イベントの実施日が確定してカレンダーに追加されたとき、そのイベントに関わった
   全員（候補日に回答した人、または事前参加登録された人。作成者本人は除く）へ、イベントのタイトルと
   実施日の一覧をDM。

前日リマインダーは、Discord Bot側の毎朝8:00（JST）のタイマーが
`POST /api/bot/reminders/day-before` を呼び出すことで実行される
（`Authorization: ******`ヘッダーで認証。`BOT_EVENTS_SECRET`は上記APIと共通）。

追加で `.env` に `SITE_BASE_URL`（このサイトの公開URL。例: `http://antemvpn0613.tplinkdns.com:9335`。
DM本文中のイベントリンク生成に使用）を設定する。

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
