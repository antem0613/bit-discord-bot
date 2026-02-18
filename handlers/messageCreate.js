import { rollDice } from "../commands/dice.js";
import { getVoiceConnection } from "@discordjs/voice";
import { TextToSpeech } from "../TextToSpeech.js";
import { enqueueTTSJob } from "../commands/tts.js";
import { TextPreprocessor } from "../textPreprocessor.js";

export default async (message, data) => {
  const guildId = message.guildId;
  const diceChannel = data.GuildConfigs[guildId]?.dice?.diceChannel;
  const ttsChannel = data.GuildConfigs[guildId]?.tts?.textChannelId;

  if (message.channel.id == diceChannel || ((diceChannel == null || diceChannel === "" || diceChannel === undefined) && message.channel.id != ttsChannel)) {
    try{
      var res = await rollDice(message, guildId, data);
  
      if(res != null){
        if ((diceChannel == null || diceChannel === "" || diceChannel === undefined)) {
          message.channel.send("ダイスボットのチャンネルを先に設定してください。");
        }
        else if (res.startsWith("s")) {
          message.channel.send("||" + res + "||");
        }
        else{
          message.channel.send(res);
        }
      }
    }
    catch(e){
      console.error(`[Dice] rollDice error:`, e);
      message.channel.send("エラーが発生しました。");
    }
  }
  else if ((ttsChannel == null || ttsChannel === "") || message.channel.id == ttsChannel) {
    console.log("TTS called : " + message.content);
    
    if (message.author.bot) return;

    const guildId = message.guildId;

    if (!guildId) return;

    const connection = getVoiceConnection(guildId);

    if (!connection) return;

    const guildConfig = data.initGuildConfigIfUndefined(guildId).tts;

    if (new RegExp(guildConfig.excludeRegEx).test(message.content)) return;

    const memberId = message.member.id;

    const memberSpeakerConfig = data.initMemberSpeakerConfigIfUndefined(guildId, memberId);

    const text = message.content;
    const dict = data.initGuildDictionaryIfUndefined(guildId);

    const splitedText = TextPreprocessor(text, dict);

    const speaker = memberSpeakerConfig;
    const player = connection.state.subscription.player;

    // 1ジョブあたりの最大文字数
    const MAX_TTS_LENGTH = parseInt(process.env.voiceServerTextLengthLimit || process.env.voiceServerTextLengthLimit || process.env.VOICEVOX_SERVER_TEXT_LENGTH_LIMIT || "160");

    // splitedTextを上限でグループ化
    let currentGroup = [];
    let currentLen = 0;
    for (const part of splitedText) {
      if (currentLen + part.length > MAX_TTS_LENGTH && currentGroup.length > 0) {
        enqueueTTSJob(guildId, {
          text: currentGroup,
          speakerConfig: speaker,
          player: player
        });
        currentGroup = [];
        currentLen = 0;
      }
      currentGroup.push(part);
      currentLen += part.length;
    }
    if (currentGroup.length > 0) {
      enqueueTTSJob(guildId, {
        text: currentGroup,
        speakerConfig: speaker,
        player: player
      });
    }
    return;
  }
};