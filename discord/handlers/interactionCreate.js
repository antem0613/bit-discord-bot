
export default async (interaction, data) => {
    if (!interaction.isChatInputCommand()) return;
    const command = interaction.client.commands.get(interaction.commandName);

    if (!command) {
        console.error(`"${interaction.commandName}" command not found`);
        return;
    }

    try {
        await command.execute(interaction, data);
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
};