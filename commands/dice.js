import bcdice from 'bcdice';
import { SlashCommandBuilder } from 'discord.js';
import { saveData, editData } from '../editData.js';
import { updateActivity } from '../main.js';

const loader = new bcdice.DynamicLoader();

export const data = new SlashCommandBuilder()
  .setName("dice")
  .setDescription("様々なシステムのダイスを振ります。")
  .addSubcommand((subcommand) => subcommand
                 .setName("help")
                 .setDescription("使い方を表示します")
                 .addStringOption(option => option
                                 .setName('system_id')
                                 .setDescription('システムごとの使い方を表示します')
                                 .setRequired(false)))
  .addSubcommand((subCommand) => subCommand
                 .setName("systems")
                 .setDescription("システム一覧を表示します"))
  .addSubcommand(subCommand => subCommand
                 .setName("set-system")
                 .setDescription("ゲームシステムを設定します。")
                 .addStringOption(option => option
                                 .setName("system_id")
                                 .setDescription("システムID 空文字でデフォルトになります")
                                 .setRequired(false)))
  .addSubcommand(subCommand => subCommand
                .setName("info")
                .setDescription("Dice機能の情報を表示します"))
  .addSubcommand(subCommand => subCommand
                .setName("roll")
                .setDescription("ダイスを振ります")
                .addStringOption(option=>option
                                .setName("command")
                                .setDescription("コマンド")
                                .setRequired(true)))
  .addSubcommand(subCommand => subCommand
                .setName("set-channel")
                .setDescription("ダイスボットの使用するチャンネルを設定します")
                .addChannelOption(option=>option
                                  .setName("channel")
                                  .setDescription("チャンネル")
                                  .setRequired(false)));
  

export async function execute(interaction){
  const subCommand=interaction.options.getSubcommand();
  
  if(subCommand=="help"){
    var id = interaction.options.getString("system_id");
    
    if(id == null || id == ""){
      await interaction.reply("## ダイス機能一覧\n- help これです。システムIDを併記することでシステム独自コマンドのヘルプが表示されます。\n- systems ゲームシステム一覧を見ることができるリンクを貼ります。\n- set ダイスボットの使用するゲームシステムを設定します。\n- roll コマンドでダイスを振ります。\n- info ダイスボットの情報を表示します。\nチャンネルに直接ダイスコマンドを入力してもダイスが振れます。")
      return
    }
    else{
      const gameSystem = await loader.dynamicLoad(id);
      await interaction.reply(gameSystem.HELP_MESSAGE);
      return;
    }
  }
  
  if(subCommand=="systems"){
    await interaction.reply("利用できるシステムの一覧です\n[BCDice公式システムリスト](https://bcdice.org/systems/)");
    return;
  }
  
  if(subCommand=="set-system"){
    var id = interaction.options.getString("system_id");
    
    const defaultGuildId = 'default';
    if(id == null || id == ""){
      editData.initGuildConfigIfUndefined(defaultGuildId).dice.system = "DiceBot";
    } else {
      editData.initGuildConfigIfUndefined(defaultGuildId).dice.system = id;
    }
    editData.saveConfig(defaultGuildId);

    saveData();
    
    await interaction.reply(`ゲームシステムを${id}に変更しました!`);
    updateActivity();
    return;
  }
  
  if(subCommand=="info"){
    const defaultGuildId = 'default';
    const diceConfig = editData.initGuildConfigIfUndefined(defaultGuildId).dice;
    await interaction.reply(">>> BCDice " + bcdice.Version + "\n現在のゲームシステム：" + diceConfig.system);
    return;
  }

  if(subCommand=="roll"){
    const command = interaction.options.getString("command");
    const result = await rollDice(command, interaction.guildId);
    if(result == null){
      await interaction.reply("コマンドが正しくありません");
      return;
    }
    await interaction.reply(result);
    return;
  }

  if(subCommand=="set-channel"){
    const channel = interaction.options.getChannel("channel");
    const guildId = interaction.guildId;
    const config = editData.initGuildConfigIfUndefined(guildId);
    const diceConfig = config.dice;

    if (channel.id === config.tts.textChannelId) {
      await interaction.reply("ダイスボットのチャンネルはTTSのチャンネルと同じにできません");
      return;
    }

    diceConfig.diceChannel = channel.id;
    editData.saveConfig(guildId);
    await interaction.reply("ダイスボットのチャンネルを"+channel.name +"に設定しました");
    return;
  }
}

export async function rollDice(command, guildId) {
  const diceConfig = editData.initGuildConfigIfUndefined(guildId).dice;
  const system = diceConfig.system;
  var roll = String(command);
  try {
    const GameSystem = await loader.dynamicLoad(system);
    console.log(system + ", " + roll);
    if(roll.match(GameSystem.COMMAND_PATTERN)){
      const result = GameSystem.eval(roll);
      console.log(result);
      if(result.secret){
        return "s"+result.text;
      }
      return result.text;
    } else {
      console.log("diceroll cannot execute");
      return;
    }
  } catch {
    return;
  }
}
