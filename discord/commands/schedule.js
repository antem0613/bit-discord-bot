import { SlashCommandBuilder } from "@discordjs/builders";

export const data = new SlashCommandBuilder()
  .setName("schedule")
  .setDescription("日程調整")
  .addSubcommand(subcommand => 
    subcommand.setName("site")
       .setDescription("日程調整のサイトのリンクを貼ります。")
  );

export const execute = async (interaction) => {
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === "site") {
        await interaction.reply("日程調整のサイト: http://antemvpn0613.tplinkdns.com:9335");
        return;
    }
};