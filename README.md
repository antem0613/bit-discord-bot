# bit-discord-bot

Discord での TRPG セッションを支援する Bot と、Discord ログイン対応の日程調整サイトです。
ダイスロール・テキスト読み上げ・候補日の回答・日程確定を、Discord と Web で連携して扱います。

## 主な機能

- BCDice を使ったダイスロールとゲームシステム選択
- VOICEVOX を使ったボイスチャンネルでの読み上げ、話者設定、読み上げ辞書
- Discord のモーダルからの日程調整イベント作成
- Web での候補日への回答、参加者設定、日程確定、部屋予約、リスケジュール
- カレンダー、募集中イベント、参加予定イベントの表示
- Discord DM による参加・日程変更・日程確定などの通知と前日リマインダー
- ターミナルの対話画面からのチャンネル選択とメッセージ送信

## 構成

| サービス | 役割 | 詳細 |
| --- | --- | --- |
| Discord Bot | コマンド受付、ダイス、読み上げ、日程調整 API 呼び出し、リマインダーの定期実行 | [Bot README](discord/README.md) |
| Session Scheduler | Discord 認証、イベント管理、カレンダー、通知、Bot 用 API | [Web README](web/session-scheduler/README.md) |

```text
discord/                  Discord Bot + VOICEVOX の Compose 構成
web/session-scheduler/    Next.js + PostgreSQL の Compose 構成
```

Bot は Web の API を呼び出し、Web は PostgreSQL にイベントを保存します。
DM の送信処理は Web 側にあり、毎朝 8:00 JST の前日リマインダー呼び出しは Bot が担当します。

## 導入

Docker Engine と Docker Compose、Discord アプリケーションと Bot が必要です。
ホストで開発する場合は Node.js 22.12 以上と npm を使用してください。

1. [Web の設定・起動手順](web/session-scheduler/README.md#セットアップ)に従い、DB とサイトを起動します。
2. [Bot の設定・起動手順](discord/README.md#セットアップ)に従い、Bot と VOICEVOX を起動します。
3. 両サービスの連携設定を揃え、Discord から `/schedule site` などで確認します。

### サービス間の連携設定

| Bot の環境変数 | Web の環境変数 | 条件 |
| --- | --- | --- |
| `TOKEN` | `DISCORD_BOT_TOKEN` | 同じ Bot を使う場合は同じトークン |
| `APPLICATION_ID` | `DISCORD_CLIENT_ID` | 同じ Discord アプリを使う場合は同じ ID |
| `DISCORD_GUILD_ID` | `DISCORD_GUILD_ID` | 対象サーバーを一致させる |
| `BOT_EVENTS_SECRET` | `BOT_EVENTS_SECRET` | 同じランダムな共有シークレット |
| `SCHEDULER_BASE_URL` | `SITE_BASE_URL` | 前者は Bot から到達可能な API の URL、後者はユーザー向け公開 URL |

2つの Compose は別ネットワークです。Bot コンテナ内の `localhost` は Web ではありません。
連携時は Bot から到達できる公開 URL などを指定してください。ローカル開発での接続方法は Bot README に記載しています。

## 運用上の注意

- 現在の Web Compose は `next dev` を起動する開発構成です。本番公開時は HTTPS、リバースプロキシ、アクセス制限を含めて構成を見直してください。
- 認証情報は各サービスの `.env` に設定します。公開用のテンプレートは各サービスの `.env.example` です。
- PostgreSQL は名前付きボリューム、Bot のギルド設定と辞書は `discord/data/` に保存されます。更新前にバックアップしてください。
- `docker compose down -v` は DB ボリュームを削除します。通常の更新では実行しないでください。

## 技術構成

Bot は Node.js・discord.js・blessed、Web は Next.js・React・Prisma・PostgreSQL を使用しています。
ダイス処理は [BCDice](https://github.com/bcdice/BCDice)、音声合成は [VOICEVOX](https://voicevox.hiroshiba.jp/) と連携します。