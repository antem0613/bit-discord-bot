# Discord Bot

ダイスロール、VOICEVOXによる読み上げ、日程調整サイトとの連携を担当するサービスです。
リポジトリ全体の概要は [ルート README](../README.md)、イベント管理側は
[Web README](../web/session-scheduler/README.md) を参照してください。

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

## セットアップ

以下のコマンドはこのディレクトリで実行します。Docker EngineとDocker Composeが必要です。

```sh
cp .env.example .env
```

[環境変数サンプル](.env.example) を基に `.env` を編集します。

| 設定 | 用途 |
| --- | --- |
| `TOKEN` / `APPLICATION_ID` | BotトークンとDiscordアプリケーションID |
| `BCDICE_API_URL` | BCDice APIの接続先 |
| `VOICEVOX_SERVER_URL` | 音声合成API。Compose内では `http://voicevox:50021` |
| `GUILD_CONFIGS_DIR` / `GUILD_DICTIONARIES_DIR` | 設定・辞書の保存先。Composeでは `./data/` 配下を使用 |
| `SCHEDULER_BASE_URL` | Botから到達できる日程調整サイトのURL |
| `BOT_EVENTS_SECRET` / `DISCORD_GUILD_ID` | Webと共通のAPI認証シークレット・対象サーバーID |

Discord Developer PortalでBotを用意し、Message Content Intentを有効にしてください。
サーバーへは `bot` と `applications.commands` のスコープで招待し、閲覧・送信・
ボイスチャンネルへの接続・発言など使用する機能に必要な権限を付与します。

```sh
docker compose up -d --build
```

このコマンドはBotとVOICEVOXを起動します。Bot起動時にグローバルスラッシュコマンドを登録します。
VOICEVOXが利用可能になる前に起動した場合、話者一覧を取得できないことがあるため、
VOICEVOX起動後にBotを再起動してください。

### 読み上げの詳細設定

サンプルは基本設定のみです。読み上げを使う場合は以下も設定してください。
`DEFAULT_SPEAKER_ENGINE` はエンジン名 `VOICEVOX`、`VOICEVOX_SERVER_URL` は接続先URLです。
話者IDは利用するVOICEVOXの `/speakers` で確認してください。

```dotenv
DEFAULT_SPEAKER_ENGINE=VOICEVOX
DEFAULT_SPEAKER_ID=0
DEFAULT_SPEAKER_SPEED_SCALE=1
DEFAULT_SPEAKER_PITCH_SCALE=0
DEFAULT_SPEAKER_INTONATION_SCALE=1
DEFAULT_SPEAKER_VOLUME_SCALE=1
DEFAULT_SPEAKER_TEMPO_DYNAMICS_SCALE=1
SPEAKER_SPEED_SCALE_LOWER_LIMIT=0.5
SPEAKER_SPEED_SCALE_UPPER_LIMIT=2
SPEAKER_PITCH_SCALE_LOWER_LIMIT=-0.15
SPEAKER_PITCH_SCALE_UPPER_LIMIT=0.15
SPEAKER_INTONATION_SCALE_LOWER_LIMIT=0
SPEAKER_INTONATION_SCALE_UPPER_LIMIT=2
SPEAKER_VOLUME_SCALE_LOWER_LIMIT=0
SPEAKER_VOLUME_SCALE_UPPER_LIMIT=2
SPEAKER_TEMPO_DYNAMICS_SCALE_LOWER_LIMIT=0
SPEAKER_TEMPO_DYNAMICS_SCALE_UPPER_LIMIT=2
autocompleteLimit=25
```

### ホストでの開発

Node.js 22.12以上を使用し、VOICEVOXを別途起動してください。
`VOICEVOX_SERVER_URL` はホストから到達できるURL（例: `http://localhost:50021`）に変更します。

```sh
npm ci
npm start
```

Botをホストで実行する場合、ローカルWebへは `http://localhost:3002` で接続できます。
BotをDockerで実行する場合は公開URLやホストへの到達可能なアドレスが必要です。
2つのComposeは別ネットワークのため、Web側のサービス名 `web` はそのままでは解決できません。

## ターミナルからメッセージを送信

TTY付きで起動すると、チャンネル一覧・複数行の本文欄・送信結果・Botログを表示する
対話コンソールが開きます。TTYがない場合は画面を開かず、Botだけを通常どおり起動します。

- 左側の一覧で上下キー・Enterを使って送信先を選択すると、本文欄に移ります。
- 一覧で `/` を押すか検索欄をクリックすると、サーバー名・チャンネル名で検索できます。
  検索語を入力してEnterで確定し、空欄で確定すると全件表示に戻ります。
- 本文はEnterで改行できます。Ctrl+Sで送信確認を開き、上下キーで「送信する」を選んでEnterで確定します。
  初期選択は「本文に戻る」なので、Enterだけで誤送信しません。
- Escでメニューを開けます。送信確認・送信先変更・一覧再取得・本文破棄・コンソール終了が可能です。
- 送信失敗時は本文を保持します。空本文・2,000文字超過・権限不足は送信できません。
  メンション文字列を含めても、ユーザー・ロール・everyoneへの通知は行いません。
- Ctrl+Cまたはメニューの終了で画面だけを閉じます。Botは継続します。
  再び画面を開くにはBotを再起動してください。画面を閉じた後のCtrl+Cは通常どおりBotを停止します。

Dockerではこのディレクトリで以下を実行します。

```sh
docker compose up -d --build --no-deps --renew-anon-volumes discord-bot
docker attach --sig-proxy=false discord-bot
```

Botを止めずに接続を切るには、Ctrl+P、Ctrl+Qの順に押してください。
接続直後に画面が乱れている場合はターミナルのサイズを変更すると再描画されます。
Ctrl+Sが端末のフロー制御に取られる場合は、Escメニューの「送信確認」を使ってください。
`docker compose exec ... sh` は別プロセスのため、このコンソールへの入力には使えません。

実際のDiscord送信を行わないテストは以下で実行できます。

```sh
node --test utils/terminalMessageSender.test.js
```

## `/schedule create` に必要な追加設定

`/schedule create` は日程調整サイトの内部API（`/api/bot/events`）を呼び出してイベントを作成するため、
`.env` に以下を追加設定する必要があります。

- `SCHEDULER_BASE_URL`: 日程調整サイトの公開URL（例: `https://scheduler.example.com`）
- `BOT_EVENTS_SECRET`: 日程調整サイト（`web/session-scheduler/.env`）と同じ値を設定する共有シークレット
- `DISCORD_GUILD_ID`: 日程調整機能を許可するサーバー（ギルド）のID（`web/session-scheduler/.env`と同じ値）

スラッシュコマンドの定義を変更した際は、下記の更新手順でBotを再ビルド・起動してください。
起動時に `regist-command.js` が実行され、Discord側のコマンド定義を更新します。
日程調整コマンドはすべて `/schedule create` と同じ `SCHEDULER_BASE_URL` /
`BOT_EVENTS_SECRET` / `DISCORD_GUILD_ID` を使うため、追加の環境変数は不要です。

## 日程調整イベントのDM通知（毎朝8:00 JSTのリマインダー / 5分ごとの締切チェック）

日程調整サイト（`web/session-scheduler`）は、参加登録時・リスケジュール時・日程確定時に
Discordユーザーへ、また参加者募集の回答期限超過時にはホストへDMを送信する。このBotは、以下2つの
実行タイミングだけを担当し、実際の判定・DM送信はすべてサイト側で行う。

- `main.js` 起動時（`clientReady`）に `utils/dailyReminderScheduler.js` のタイマーが開始され、
  毎朝8:00（JST）に `POST {SCHEDULER_BASE_URL}/api/bot/reminders/day-before`
  （確定済みイベントの前日リマインダー）を呼び出す。
- 同じく `clientReady` で `utils/expiredRecruitmentScheduler.js` のタイマーが開始され、
  5分ごとに `POST {SCHEDULER_BASE_URL}/api/bot/reminders/expired-recruitment`
  （回答期限が過ぎて自動終了した募集をホストへDM通知）を呼び出す。誰かがイベントページを
  開くのを待たず、期限超過後すぐにホストへ通知が届くようにするためのポーリング。
- どちらも `Authorization: Bearer <BOT_EVENTS_SECRET>` 付きで呼び出す。
- 追加の環境変数は不要（`/schedule create` で設定済みの `SCHEDULER_BASE_URL` / `BOT_EVENTS_SECRET`
  をそのまま使う）。

## コマンド例

- `/dice roll <コマンド>` : ダイスを振る
- `/dice help` : ダイス機能の使い方を表示
- `/tts on` : TTS機能を有効化
- `/tts off` : TTS機能を無効化
- `/schedule create` : 日程調整イベントを作成（モーダル入力）
- `/schedule list month:10` : 今年10月の確定イベント一覧を表示（自分にのみ表示）
- `/schedule recruiting` : 募集中のイベント一覧を表示（自分にのみ表示）
- `/schedule mine` : 自分が参加していて実施日が今日以降のイベント一覧を表示（自分にのみ表示）

## 更新とデータ保存

```sh
docker compose up -d --build --no-deps --renew-anon-volumes discord-bot
```

Botのコードはイメージにコピーされるため、通常の `up -d` や `restart` だけでは
コード変更が反映されません。依存変更時は匿名の `node_modules` ボリュームも更新します。
環境変数のみを変えた場合は `docker compose up -d --force-recreate discord-bot` で反映できます。

`data/guild_configs/` と `data/guild_dictionaries/` はホストに保存されます。
バックアップし、ユーザー・チャンネルIDを含む実データをGitに追加しないでください。
`.env` は実行時にComposeが読み込み、イメージには含めません。

| 症状 | 確認事項 |
| --- | --- |
| 新しいサブコマンドが出ない | 最新コードで再ビルドしたか、起動時の登録が成功したか |
| 日程調整APIが401になる | Webと `BOT_EVENTS_SECRET` が一致しているか |
| 日程調整APIへ接続できない | コンテナ内の `localhost` をWebの接続先にしていないか |
| 読み上げの話者が出ない | VOICEVOXの起動状態、接続先、Botの再起動 |

Bot内のHTTPサーバーは `SERVER_PORT`（既定値3000）の `/health` を返します。
現在のComposeではこのポートをホストには公開していません。