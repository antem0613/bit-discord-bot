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
/dice set-channel [channel] - ダイスボットの使用するチャンネルを設定します。

テキストチャンネルに直接ダイスコマンドを入力してもダイスが振れます。
`;
        await interaction.reply(helpMessage);
        return;
    }

    if (option === 'tts') {
        const helpMessage =
`**TTSボットのコマンド一覧**
/tts on [id] [textchannel] [voicechannel] [speed] [pitch] [intonation] [volume] [tempo] - 読み上げを有効にします。各オプションは省略可能です。
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
このBotはダイスボットとTTSボットの機能を提供します。

- ダイスボットのコマンド一覧を見るには、/help dice と入力してください。
- TTSボットのコマンド一覧を見るには、/help tts と入力してください。

各コマンドの詳細な使い方は、各コマンドの説明をご覧ください。
`;
    await interaction.reply(generalHelpMessage);
}