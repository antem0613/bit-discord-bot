import { MessageFlags } from "discord.js";

// 通常のコマンド実行エラーや例外ではBotはシャットダウンしません（致命的な場合のみプロセス終了）
async function runHandler(interaction, data, run) {
    try {
        await run();
    } catch (error) {
        // 詳細なエラー内容をログ出力
        if (error instanceof Error) {
            console.error('InteractionCreate Error:', error.message);
            console.error('Stack Trace:', error.stack);
        } else {
            console.error('InteractionCreate Error:', error);
        }
        const reply = { content: 'コマンドの実行中にエラーが発生しました。', flags: MessageFlags.Ephemeral };
        try {
            if (interaction.replied || interaction.deferred) {
                await interaction.followUp(reply);
            } else {
                await interaction.reply(reply);
            }
        } catch (replyError) {
            console.error('Failed to report the error to the user:', replyError);
        }
    }
}

export default async (interaction, data) => {
    if (interaction.isAutocomplete()) {
        // Suggestions while typing an option (e.g. TTS speaker, dice system). Must answer within 3s,
        // and a failure must never surface as a reply, so errors fall back to an empty list.
        const command = interaction.client.commands.get(interaction.commandName);
        if (!command?.autocomplete) return;
        try {
            await command.autocomplete(interaction, data);
        } catch (error) {
            console.error(`Autocomplete error for "${interaction.commandName}":`, error);
            if (!interaction.responded) await interaction.respond([]).catch(() => {});
        }
        return;
    }

    // Slash commands and right-click (context menu) commands share the same `execute` entry point.
    if (interaction.isChatInputCommand() || interaction.isContextMenuCommand?.()) {
        const command = interaction.client.commands.get(interaction.commandName);
        if (!command) {
            console.error(`"${interaction.commandName}" command not found`);
            return;
        }
        await runHandler(interaction, data, () => command.execute(interaction, data));
        return;
    }

    if (interaction.isModalSubmit()) {
        // customId convention: "<commandName>:<action>" (e.g. "schedule:create"), so the owning
        // command module can be looked up the same way chat-input commands are.
        const [commandName] = interaction.customId.split(":");
        const command = interaction.client.commands.get(commandName);
        if (!command?.handleModalSubmit) {
            console.error(`No modal handler found for customId "${interaction.customId}"`);
            return;
        }
        await runHandler(interaction, data, () => command.handleModalSubmit(interaction, data));
        return;
    }

    if (interaction.isButton?.()) {
        // Same "<commandName>:<action>:..." custom ID convention as modals.
        const [commandName] = interaction.customId.split(":");
        const command = interaction.client.commands.get(commandName);
        if (!command?.handleButton) {
            console.error(`No button handler found for customId "${interaction.customId}"`);
            return;
        }
        await runHandler(interaction, data, () => command.handleButton(interaction, data));
    }
};
