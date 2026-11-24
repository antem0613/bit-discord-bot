import { rollDice } from "../commands/dice.js";
import { getVoiceConnection } from "@discordjs/voice";
import { enqueueTTSJob, limitSentences } from "../TextToSpeech.js";
import { TextPreprocessor } from "../textPreprocessor.js";
import { EmbedBuilder } from "discord.js";

// While no dice channel is configured, a dice-like message anywhere gets a "set the channel first" hint.
// Rate-limited per channel so ordinary chat that happens to match a dice pattern doesn't spam it.
const DICE_HINT_INTERVAL_MS = 10 * 60 * 1000;
const lastDiceHintAt = new Map(); // channelId -> epoch ms

// Fire-and-forget send that can't become an unhandled rejection (e.g. missing Send Messages permission).
function sendSafely(channel, payload) {
  channel.send(payload).catch((e) => console.error("[messageCreate] failed to send message:", e?.message ?? e));
}

export function shouldSendDiceHint(channelId, now = Date.now()) {
  const last = lastDiceHintAt.get(channelId);
  if (last !== undefined && now - last < DICE_HINT_INTERVAL_MS) return false;
  lastDiceHintAt.set(channelId, now);
  return true;
}

export default async (message, data) => {
  const guildId = message.guildId;
  const diceChannel = data.GuildConfigs[guildId]?.dice?.diceChannel;
  const ttsChannel = data.GuildConfigs[guildId]?.tts?.textChannelId;
  const displayName = message.member ? message.member.displayName : message.author.username;
  const avatarUrl = message.member ? message.member.displayAvatarURL() : message.author.displayAvatarURL();
  const diceChannelUnset = diceChannel == null || diceChannel === "";

  if (message.channel.id == diceChannel || (diceChannelUnset && message.channel.id != ttsChannel)) {
    if (message.author.bot) return; // never roll for (or reply to) other bots
    try{
      var res = await rollDice(message, guildId, data);

      if(res != null){
        if (diceChannelUnset) {
          if (shouldSendDiceHint(message.channel.id)) {
            sendSafely(message.channel, "ダイスボットのチャンネルを先に設定してください（`/dice set-channel`）。`/dice roll` はどのチャンネルでも使えます。");
          }
        }
        else if (res.startsWith("s")) {
          const embed = new EmbedBuilder()
            .setAuthor({
              name: displayName,
              iconURL: avatarUrl
            })
            .setDescription("||" + res + "||");

          sendSafely(message.channel, { embeds: [embed] });
        }
        else{
          const embed = new EmbedBuilder()
            .setAuthor({
              name: displayName,
              iconURL: avatarUrl
            })
            .setDescription(res);

          sendSafely(message.channel, { embeds: [embed] });
        }
      }
    }
    catch(e){
      console.error(`[Dice] rollDice error:`, e);
      sendSafely(message.channel, "エラーが発生しました。");
    }
  }
  else if ((ttsChannel == null || ttsChannel === "") || message.channel.id == ttsChannel) {
    // Any exception here would become an unhandled rejection in the async event listener and take the
    // whole process down, so the TTS path is fully guarded.
    try {
      enqueueMessageForSpeech(message, data);
    } catch (e) {
      console.error("[TTS] failed to queue message:", e);
    }
  }
};

function enqueueMessageForSpeech(message, data) {
  if (message.author.bot) return;

  const guildId = message.guildId;
  if (!guildId || !message.member) return;

  const connection = getVoiceConnection(guildId);
  // Not connected, or mid-reconnect without a player attached yet.
  const player = connection?.state?.subscription?.player;
  if (!player) return;

  const guildConfig = data.initGuildConfigIfUndefined(guildId).tts;
  if (guildConfig.excludeRegEx) {
    let exclude = null;
    try {
      exclude = new RegExp(guildConfig.excludeRegEx);
    } catch {
      console.error(`[TTS] invalid excludeRegEx for guild ${guildId}:`, guildConfig.excludeRegEx);
    }
    if (exclude?.test(message.content)) return;
  }

  const speaker = data.initMemberSpeakerConfigIfUndefined(guildId, message.member.id);
  const dict = data.initGuildDictionaryIfUndefined(guildId);
  const sentences = limitSentences(TextPreprocessor(message.content, dict));
  if (sentences.length === 0) return;

  // One job per message; TextToSpeech synthesizes it sentence by sentence.
  enqueueTTSJob(guildId, { text: sentences, speakerConfig: speaker, player });
}
