# bit-discord-bot

このプロジェクトは、ダイスロール機能とTTS（テキスト読み上げ）機能を備えた Discord ボットです。

## 主な機能

- **ダイスロール**
  - 様々なTRPGシステムのダイスを振ることができます。
  - サブコマンドでシステム選択やヘルプ表示、チャンネル指定などが可能です。
- **TTS（テキスト読み上げ）**
  - 指定したテキストをボイスチャンネルで読み上げます。
  - 有効/無効の切り替えが可能です。

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

## コマンド例

- `/dice roll <コマンド>` : ダイスを振る
- `/dice help` : ダイス機能の使い方を表示
- `/tts activate <true|false>` : TTS機能の有効/無効を切り替え

## ライセンス

MIT License

---

ご質問・要望は Issue へどうぞ。