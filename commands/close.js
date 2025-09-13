import { SlashCommandBuilder } from "discord.js";

export const data = new SlashCommandBuilder().setName("close").setDescription("ボットを終了します");

export async function execute(interaction){
    if(interaction.memberPermissions.has("ADMINISTRATOR") == true){
        await interaction.reply("シャットダウンします");
        process.exit();
    }
    else{
        await interaction.reply("権限がありません");
    }
}