# bit-discord-bot

このプロジェクトは、ダイスロール機能とTTS（テキスト読み上げ）機能を備えた Discord ボットです。

## 主な機能

- **ダイスロール**
  - 様々なTRPGシステムのダイスを振ることができます。
  - サブコマンドでシステム選択やヘルプ表示、チャンネル指定などが可能です。
- **TTS（テキスト読み上げ）**
  - 指定したテキストをボイスチャンネルで読み上げます。
  - 有効/無効の切り替えが可能です。
- **日程調整（schedule）**
  - `/schedule site` : 日程調整サイトのリンクを表示します。
  - `/schedule create` : モーダル（フォーム）でタイトル・説明・候補日・回答期限を入力し、
    日程調整サイト（`web/session-scheduler`）にイベントを作成します。サイトに未ログインの
    メンバーでも、このコマンドを実行したDiscordアカウントの情報でそのままイベントを作成できます。
  - `/schedule list month:<月> [year:<年>] [day:<日>]` : 指定した月（任意で日まで）に実施される
    確定済みイベントの一覧を表示します。返信はコマンドを実行した本人にのみ見える
    （ephemeral）返信です。`month` は必須、`year` 省略時は今年、`day` を指定するとその日のみに
    絞り込みます。
  - `/schedule recruiting` : 現在募集中（回答受付中）のイベント一覧を表示します
    （本人にのみ見える返信）。
  - `/schedule mine` : 自分が参加していて、実施日が今日以降の確定イベント一覧を表示します
    （本人にのみ見える返信）。

## 使い方

1. 必要な Node.js パッケージをインストールします。
	```sh
	npm install
	```
2. `.env` ファイルを作成し、Discord Bot のトークン等を設定します。
	```env
	TOKEN=あなたのDiscordBotトークン
	APPLICATION_ID=あなたのアプリケーションID
	```
3. ボットを起動します。
	```sh
	node main.js
	```

## `/schedule create` に必要な追加設定

`/schedule create` は日程調整サイトの内部API（`/api/bot/events`）を呼び出してイベントを作成するため、
`.env` に以下を追加設定する必要があります。

- `SCHEDULER_BASE_URL`: 日程調整サイトの公開URL（例: `http://antemvpn0613.tplinkdns.com:9335`）
- `BOT_EVENTS_SECRET`: 日程調整サイト（`web/session-scheduler/.env`）と同じ値を設定する共有シークレット
- `DISCORD_GUILD_ID`: 日程調整機能を許可するサーバー（ギルド）のID（`web/session-scheduler/.env`と同じ値）

新しいスラッシュコマンド（`/schedule create`・`/schedule list`・`/schedule recruiting`・
`/schedule mine`）を追加した際は、`regist-command.js` を再実行してDiscord側のコマンド定義を
更新してください。これらはすべて `/schedule create` と同じ `SCHEDULER_BASE_URL` /
`BOT_EVENTS_SECRET` / `DISCORD_GUILD_ID` を使うため、追加の環境変数は不要です。

## 日程調整イベントのDM通知（毎朝8:00 JSTのリマインダー）

日程調整サイト（`web/session-scheduler`）は、参加登録時・リスケジュール時にDiscordユーザーへ
DMを送信するほか、「確定した実施日の前日」リマインダーも送信する。このBotは、前日リマインダーの
実行タイミング（毎朝8:00 JST）だけを担当し、実際の判定・DM送信はすべてサイト側で行う。

- `main.js` 起動時（`clientReady`）に `utils/dailyReminderScheduler.js` のタイマーが開始され、
  毎朝8:00（JST）に `POST {SCHEDULER_BASE_URL}/api/bot/reminders/day-before` を
  `Authorization: Bearer <BOT_EVENTS_SECRET>` 付きで呼び出す。
- 追加の環境変数は不要（`/schedule create` で設定済みの `SCHEDULER_BASE_URL` / `BOT_EVENTS_SECRET`
  をそのまま使う）。

## コマンド例

- `/dice roll <コマンド>` : ダイスを振る
- `/dice help` : ダイス機能の使い方を表示
- `/tts activate <true|false>` : TTS機能の有効/無効を切り替え
- `/schedule create` : 日程調整イベントを作成（モーダル入力）
- `/schedule list month:10` : 今年10月の確定イベント一覧を表示（自分にのみ表示）
- `/schedule recruiting` : 募集中のイベント一覧を表示（自分にのみ表示）
- `/schedule mine` : 自分が参加していて実施日が今日以降のイベント一覧を表示（自分にのみ表示）

## ライセンス

MIT License

---

ご質問・要望は Issue へどうぞ。