
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
        if (interaction.replied || interaction.deferred) {
            await interaction.followUp({ content: 'error occurred while executing command.', ephemeral: true });
        } else {
            await interaction.reply({ content: 'error occurred while executing command.', ephemeral: true });
        }
    }
}

export default async (interaction, data) => {
    if (interaction.isChatInputCommand()) {
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
    }
};