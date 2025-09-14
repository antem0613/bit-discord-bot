
export default async (interaction, data) => {
    if (!interaction.isChatInputCommand()) return;
    const command = interaction.client.commands.get(interaction.commandName);

    if (!command) {
        console.error(`"${interaction.commandName}" command not found`);
        return;
    }

    try {
        // ttsコマンドの場合は ttsData を渡す
        if (interaction.commandName === "tts") {
            await command.execute(interaction, data);
        } else {
            await command.execute(interaction);
        }
    } catch (error) {
        console.error(error);
        if (interaction.replied || interaction.deferred) {
            await interaction.followUp({ content: 'error occurred while executing command.', ephemeral: true });
        } else {
            await interaction.reply({ content: 'error occurred while executing command.', ephemeral: true });
        }
    }
};