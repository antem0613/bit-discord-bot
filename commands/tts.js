import { SlashCommandBuilder } from "discord.js";

export const data = new SlashCommandBuilder()
    .setName("tts")
    .setDescription("テキスト読み上げ")
    .addSubcommand(subCommand => subCommand
        .setName("on")
        .setDescription("テキスト読み上げを有効にします")
    )
    .addSubcommand(subCommand => subCommand
        .setName("off")
        .setDescription("テキスト読み上げを無効にします")
    );