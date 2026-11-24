# Session Scheduler

Discordサーバーのメンバー向けの日程調整サイトです。Next.js、React、Prisma、PostgreSQLを使用し、
候補日への回答、参加者設定、日程確定、カレンダー、部屋予約、リスケジュールを扱います。

全体の概要は [ルート README](../../README.md)、Discordからの操作とリマインダー起動は
[Bot README](../../discord/README.md) を参照してください。

## セットアップ

以下のコマンドはこのディレクトリで実行します。Docker EngineとDocker Composeが必要です。

```sh
cp .env.example .env
```

[環境変数サンプル](.env.example) を基にDB・Discord認証情報と公開URLを設定します。
`SESSION_SECRET` と `BOT_EVENTS_SECRET` は別々のランダムな値を使用してください。
例えば `openssl rand -hex 32` で生成できます。サンプルのDBパスワードは必ず変更してください。

Composeは本番構成です。Next.jsをビルド（`next build`、standalone出力）し、`node server.js` で起動します。
起動時には `migrate` サービスが未適用のマイグレーションを自動で適用し、成功してからWebが起動します。

```sh
docker compose up -d --build
docker compose logs migrate   # 「No pending migrations」または適用したマイグレーション名
```

[http://localhost:3002](http://localhost:3002) でアクセスできます。

ホットリロードする開発用構成で起動する場合は、開発用のオーバーライドを重ねます。

```sh
docker compose -f docker-compose.yml -f docker-compose.dev.yml up
```

## 環境変数とDocker

`.env.example` を参考に `.env` を作成し、実際の認証情報を設定してください。
`.env` とその派生ファイルはGitとDockerビルドから除外されます。

- `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB`: PostgreSQLの設定。
- `POSTGRES_HOST` / `POSTGRES_PORT`: ホスト側の接続先（既定値: `localhost:5433`）。
   Webコンテナでは Compose がホスト名だけを `db` に切り替えます。
   接続URLはPrisma CLIとアプリ共通の関数で生成するため、`DATABASE_URL` と
   `DATABASE_URL_DOCKER` の記入は不要です。パスワードはそのまま記入し、URLエンコードは不要です。
- `SITE_BASE_URL`: DDNSなどの公開URL。イベントリンクとログイン後の転送先に使用します。
- `COOKIE_SECURE`（任意）: ログインCookieに `Secure` を付けるか（`true` / `false`）。未設定なら
   `SITE_BASE_URL` が `https://` のときだけ付けます。HTTPSのリバースプロキシ配下で
   `SITE_BASE_URL` を設定しない場合は `true` にしてください。
- `ALLOWED_DEV_ORIGINS`: 開発サーバーを許可するホスト名のカンマ区切り。
   スキーム・ポートは含めません（例: `scheduler.example.com,localhost`）。

既存のDBボリュームがある場合、`.env` の `POSTGRES_PASSWORD` を変更するだけでは
DB内のパスワードは更新されません。環境変数変更後はコンテナを再作成してください。

## Discordログイン設定

1. [Discord Developer Portal](https://discord.com/developers/applications) でアプリケーションを作成し、OAuth2の Redirect URL に `http://localhost:3002/api/auth/callback` を登録する。公開時は公開URLの `/api/auth/callback` を登録する。
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

同じリポジトリのDiscord Botの `/schedule create` コマンドから、サイトにログインしていない
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

以下のタイミングで、Botトークンを使って対象のDiscordユーザーにDM（ダイレクトメッセージ）を
送信する（`lib/notifications.ts`）。いずれも送信失敗（DM拒否設定など）はログに記録されるのみで、
元の処理（イベント作成・リスケジュール・リマインダー実行）自体は継続する。

1. **参加者の事前登録時**: イベント作成時に参加者としてあらかじめ設定されたメンバーへ。
2. **リスケジュール時**: リスケジュールされたイベントの参加者（事前登録者＋前回の回答者）へ。
3. **前日リマインダー**: 確定済みイベントの実施日が「明日（日本時間）」になったとき、その日に
   〇・△・？で回答した人（×・未回答の人は含めない）へ。実施日が連続している場合は、
   その連続の最初の日の前日にのみ送る。
4. **募集の自動終了時**: 回答期限が過ぎて参加者募集が自動的に終了したとき、ホスト（作成者）へ。
   ホスト自身が「参加受付を締め切る」ボタンで手動終了した場合はDMを送らない（既に把握しているため）。
   誰かがイベントページを開いたタイミングに依存せず、Discord Bot側の5分ごとのポーリングで
   能動的に検知して通知する（後述）。
5. **日程確定時**: イベントの実施日が確定してカレンダーに追加されたとき、そのイベントに関わった
   全員（候補日に回答した人、または事前参加登録された人。作成者本人は除く）へ、イベントのタイトルと
   実施日の一覧をDM。

前日リマインダーは、Discord Bot側の毎朝8:00（JST）のタイマーが
`POST /api/bot/reminders/day-before` を呼び出すことで実行される。
募集の自動終了時の通知は、Discord Bot側の5分ごとのタイマーが
`POST /api/bot/reminders/expired-recruitment` を呼び出すことで実行される
（この5分間隔のポーリングが、「誰かがイベントページを開いたときにしか通知されない」という
以前の遅延評価方式の問題を解消している）。
どちらも `Authorization: Bearer <BOT_EVENTS_SECRET>` ヘッダーで認証する（`BOT_EVENTS_SECRET`は
上記APIと共通）。

追加で `.env` に `SITE_BASE_URL`（このサイトの公開URL。例: `https://scheduler.example.com`。
DM本文中のイベントリンク生成に使用）を設定する。

## 開発

ホストではNode.js 22.12以上とnpmを使用します。
DBはComposeで起動し、`.env` の `POSTGRES_HOST` を `localhost` にします。
Compose内のWebと同じポートは使えないため、先にWebを停止します。

```sh
npm ci
docker compose stop web
docker compose up -d db
npx prisma migrate deploy
npm run dev
```

```sh
npm run lint
npm run build
npm start -- --port 3002
```

`predev` と `prebuild` がPrisma Clientを生成します。スキーマ変更の開発時は
`npx prisma migrate dev --name <変更名>`、既存マイグレーションの適用は `migrate deploy` を使用します。
開発用DBと本番DBは分離し、`migrate dev` を本番DBに対して実行しないでください。

## 更新とデータ保存

コードの更新はビルドし直して反映します。マイグレーションも自動で適用されます。

```sh
git pull
docker compose exec -T db pg_dump -U <POSTGRES_USERの値> -d <POSTGRES_DBの値> > backup.sql   # 事前バックアップ
docker compose up -d --build
docker compose logs migrate
```

環境変数だけを変えた場合はビルド不要で、コンテナの再作成だけで反映されます
（`docker compose up -d --force-recreate web`）。
マイグレーションが失敗した場合、Webは起動せず、それまでのコンテナが動き続けます。
`docker compose logs migrate` で原因を確認してください。

DBは `db-data` の名前付きボリュームに保存されます。更新・マイグレーション前には
バックアップしてください。`docker compose down -v` はDBデータを削除します。

### DBパスワードの変更

既存DBのパスワードは環境変数だけでは変更できません。Webを停止してDBに接続します。

```sh
docker compose stop web
docker compose exec db psql -U <POSTGRES_USERの値> -d <POSTGRES_DBの値>
```

`psql` 内で `\password`、完了後に `\q` を実行します。
`.env` の `POSTGRES_PASSWORD` を更新してから反映・確認します。

```sh
docker compose up -d --force-recreate db web
docker compose exec -T web npx prisma migrate status
```

パスワードはコマンド引数やGitに書かないでください。URLエンコードは共通関数が行います。

## トラブルシューティング

| 症状 | 確認事項 |
| --- | --- |
| DB認証エラー | DB内のパスワードと `.env` の一致、コンテナの再作成 |
| Prismaの追加フィールドが認識されない | 本番構成は `docker compose up -d --build`、開発サーバーは `npx prisma generate` と再起動 |
| ログイン後のURLが違う | `SITE_BASE_URL` と `DISCORD_REDIRECT_URI` |
| OAuthのstateエラー | 同じ公開ホストでログインを開始・完了しているか、Cookieが保存されているか |
| メンバー一覧が403になる | BotトークンとServer Members Intent |
| Bot APIが401になる | 両サービスの `BOT_EVENTS_SECRET` |
| リマインダーが来ない | Botの稼働、サイト到達性、対象日・回答条件、DM受信設定 |

公開運用ではHTTPSを使用してください（`SITE_BASE_URL` を `https://` にするとCookieに `Secure` が付きます）。
開発サーバーやDBポートを無制限に公開しないでください。

## 主なファイル

- [DBスキーマ](prisma/schema.prisma): イベント・参加者・回答・部屋予約のモデル
- [DB接続URL生成](lib/database-url.ts): CLIとWebの接続設定共通化
- [Discord認証](lib/discord-auth.ts): OAuth、セッション、Bot API認証
- [通知処理](lib/notifications.ts): Discord DM送信
- [イベントAPI](app/api/bot/events/route.ts): Botからの作成・一覧取得
