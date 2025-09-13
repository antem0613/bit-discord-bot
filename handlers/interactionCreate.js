export default async(interaction) => {
    if (!interaction.isChatInputCommand()) return;
      const command = interaction.client.commands.get(interaction.commandName);
  
      if (!command) {
          console.error(`"${interaction.commandName}" command not found`);
          return;
      }
  
      try {
          await command.execute(interaction);
      } catch (error) {
          console.error(error);
          if (interaction.replied || interaction.deferred) {
              await interaction.followUp({ content: 'error occurred while executing command.', ephemeral: true });
          } else {
              await interaction.reply({ content: 'error occurred while executing command.', ephemeral: true });
          }
      }
  };