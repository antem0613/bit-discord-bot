import bcdice from 'bcdice';
import { SlashCommandBuilder } from 'discord.js';
import { saveData } from '../editData.js';
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
  

export async function execute(interaction, data){
  const subCommand=interaction.options.getSubcommand();
  const guildId = interaction.guildId;
  
  if(subCommand=="help"){
    var id = interaction.options.getString("system_id");
    
    if(id == null || id == ""){
      await interaction.reply(`ヘルプ一覧
- /dice help system_id]  
　ダイス機能の使い方を表示します。system_idを指定すると、そのシステム独自のコマンドヘルプが表示されます。  
　例: /dice help Cthulhu

- /dice systems  
　利用できるゲームシステムの一覧を表示します。  
　→ [BCDice公式システムリスト](https://bcdice.org/systems/)

- /dice set-system [system_id]  
　ダイスボットの使用するゲームシステムを設定します。空欄の場合はデフォルト（DiceBot）になります。  
　例: /dice set-system Cthulhu

- /dice info  
　Dice機能の情報（BCDiceのバージョンや現在のゲームシステム）を表示します。

- /dice roll [コマンド]  
　指定したコマンドでダイスを振ります。  
　例: /dice roll 2d6+3  
　コマンドは各ゲームシステムのルールに従って記述してください。

- /dice set-channel [channel]  
　ダイスボットの使用するチャンネルを設定します。TTSのチャンネルと同じにはできません。  
　例: /dice set-channel #dice-channel
- ダイスボットのチャンネルが未設定の場合、ダイスコマンドを送信すると「ダイスボットのチャンネルを先に設定してください」と表示されます。
- テキストチャンネルに直接ダイスコマンド（例: 2d6+3）を入力してもダイスが振れます。
- コマンドが正しくない場合は「コマンドが正しくありません」と表示されます。
- シークレットダイスは ||結果|| のように隠して表示されます。`);
      return
    }
    else{
      let gameSystem;
      try {
        gameSystem = await loader.dynamicLoad(id);
      } catch (e) {
        await interaction.reply(`システムID「${id}」の取得に失敗しました。IDが正しいか確認してください。`);
        return;
      }
      if (!gameSystem || !gameSystem.HELP_MESSAGE) {
        await interaction.reply(`システムID「${id}」のヘルプが取得できません。IDが正しいか確認してください。`);
        return;
      }
      await interaction.reply(gameSystem.HELP_MESSAGE);
      return;
    }
  }
  
  if(subCommand=="systems"){
    await interaction.reply("利用できるシステムの一覧です\n[BCDice公式システムリスト](https://bcdice.org/systems/)");
    return;
  }
  
  if(subCommand=="set-system"){
    var id = null;

    try{
      id = await loader.dynamicLoad(interaction.options.getString("system_id"));
    }
    catch(e){
      if(interaction.options.getString("system_id") == null || interaction.options.getString("system_id") == ""){
        id = null;
      }
      else{
        console.log(`Failure to load dice system "${interaction.options.getString("system_id")}" `);
        await interaction.reply(`システムID「${interaction.options.getString("system_id")}」の取得に失敗しました。IDが正しいか確認してください。`);
        return;
      }
    }

    if(id == null || id == ""){
      id = "DiceBot";
      data.initGuildConfigIfUndefined(guildId).dice.system = "DiceBot";
    } else {
      data.initGuildConfigIfUndefined(guildId).dice.system = id;
    }
    data.saveConfig(guildId);

    saveData();
    
    console.log(`Guild ${guildId} set dice system to ${id}`);
    await interaction.reply(`ゲームシステムを${id}に変更しました!`);
    updateActivity();
    return;
  }
  
  if(subCommand=="info"){
    const diceConfig = data.initGuildConfigIfUndefined(guildId).dice;
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
    const config = data.initGuildConfigIfUndefined(guildId);
    const diceConfig = config.dice;

    if (channel.id === config.tts.textChannelId) {
      await interaction.reply("ダイスボットのチャンネルはTTSのチャンネルと同じにできません");
      return;
    }

    diceConfig.diceChannel = channel.id;
    data.saveConfig(guildId);
    await interaction.reply("ダイスチャンネルを"+channel.name +"に設定しました");
    return;
  }
}

export async function rollDice(command, guildId, data) {
  const diceConfig = data.initGuildConfigIfUndefined(guildId).dice;
  const system = diceConfig.system;
  var roll = String(command);
  let GameSystem;
  try {
    GameSystem = await loader.dynamicLoad(system);
  } catch (e) {
    console.log(`ダイスシステム「${system}」の取得に失敗:`, e);
    return null;
  }
  if (!GameSystem || !GameSystem.COMMAND_PATTERN || typeof GameSystem.eval !== 'function') {
    console.log(`ダイスシステム「${system}」が正しくロードできません。`);
    return null;
  }
  console.log(system + ", " + roll);
  if(roll.match(GameSystem.COMMAND_PATTERN)){
    let result;
    try {
      result = GameSystem.eval(roll);
    } catch (e) {
      console.log("ダイスロールの評価に失敗:", e);
      return null;
    }
    console.log(result);
    if(result && result.secret){
      return "s"+result.text;
    }
    return result ? result.text : null;
  } else {
    console.log("diceroll cannot execute");
    return null;
  }
}
