import { SlashCommandBuilder } from "discord.js";

export const data = new SlashCommandBuilder()
    .setName("help")
    .setDescription("ヘルプを表示します")
    .addSubcommand(option =>
        option.setName('dice')
            .setDescription('ダイスボットのコマンドのヘルプを表示します')
    )
    .addSubcommand(option =>
        option.setName('tts')
            .setDescription('TTSボットのコマンドのヘルプを表示します')
    )
    .addSubcommand(option =>
        option.setName('schedule')
            .setDescription('日程調整のコマンドのヘルプを表示します')
    );

export async function execute(interaction, editData) {
    const option = interaction.options.getSubcommand();

    if (option === 'dice') {
        const helpMessage =
`**ダイスボットのコマンド一覧**
/dice help [system_id] - 使い方を表示します。system_idを指定するとそのシステム独自のヘルプが表示されます。
/dice systems - 利用できるゲームシステム一覧を表示します。
/dice set-system [system_id] - ゲームシステムを設定します。空欄でデフォルト(DiceBot)になります。
/dice info - Dice機能の情報を表示します。
/dice roll [コマンド] - ダイスを振ります。例: /dice roll 2d6+3
/dice set-channel [channel] - ダイスボットの使用するチャンネルを設定します。省略するとコマンドを実行したチャンネルになります。

ダイスチャンネルに直接ダイスコマンド（例: 2d6+3）を入力してもダイスが振れます。
/dice roll はどのチャンネルでも使えます。
system_id は名前を入力すると候補が表示されます。
`;
        await interaction.reply(helpMessage);
        return;
    }

    if (option === 'schedule') {
        const helpMessage =
`**日程調整のコマンド一覧**
/schedule site - 日程調整サイトのリンクを表示します。
/schedule create - フォームから日程調整イベントを作成します（時間・参加者などの詳しい設定はサイトから）。
/schedule recruiting - 回答受付中のイベント一覧を表示します。
/schedule todo - 自分がまだ回答していない募集の一覧を表示します。
/schedule mine - 自分が参加する、今日以降の確定イベントを表示します。
/schedule list [month] [year] [day] - 指定した月（日）の確定イベント一覧を表示します。

一覧系のコマンドの結果はあなたにだけ表示されます。
日程が確定したときや候補日が追加されたときは、Botから DM でお知らせします。
`;
        await interaction.reply(helpMessage);
        return;
    }

    if (option === 'tts') {
        const helpMessage =
`**TTSボットのコマンド一覧**
/tts on [id] [textchannel] [voicechannel] [speed] [pitch] [intonation] [volume] [tempo] - 読み上げを有効にします。各オプションは省略可能です。話者は名前を入力すると候補が表示されます。
/tts off - 読み上げを無効にします。
/tts list - 利用可能な話者一覧を表示します。
/tts param [speaker] [speed] [pitch] [intonation] [volume] [tempo] - 読み上げのパラメータを設定します。
/tts speaker [id] - 話者を設定します。
/tts speed [scale] - 読み上げの速度を設定します。
/tts pitch [scale] - 読み上げの音高を設定します。
/tts intonation [scale] - 読み上げの抑揚を設定します。
/tts volume [scale] - 読み上げの音量を設定します。
/tts tempo [scale] - 読み上げのテンポを設定します。
/tts channel [textchannel] - 読み上げに使用するテキストチャンネルを設定します。
/tts info - TTS機能の情報を表示します。
/tts help - 使い方を表示します。
`;
        await interaction.reply(helpMessage);
        return;
    }

    const generalHelpMessage =
`**ヘルプコマンドへようこそ！**
このBotはダイスボット・TTSボット・日程調整の機能を提供します。

- ダイスボットのコマンド一覧を見るには、/help dice と入力してください。
- TTSボットのコマンド一覧を見るには、/help tts と入力してください。
- 日程調整のコマンド一覧を見るには、/help schedule と入力してください。

（サーバー管理者向け）/say でBotとして任意のチャンネルに発言できます。送信した発言は、
メッセージを右クリック →「アプリ」→「Botの発言を編集」「Botの発言を削除」で変更できます。

各コマンドの詳細な使い方は、各コマンドの説明をご覧ください。
`;
    await interaction.reply(generalHelpMessage);
}