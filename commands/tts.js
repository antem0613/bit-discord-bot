import { getVoiceConnection, joinVoiceChannel, createAudioPlayer, NoSubscriberBehavior } from "@discordjs/voice";
import { SlashCommandBuilder, ApplicationCommandOptionType, ChannelType, AttachmentBuilder } from "discord.js";
import { TextPreprocessor } from "../textPreprocessor.js";
import { TextToSpeech } from "../TextToSpeech.js";
import { saveData, editData } from '../editData.js';
import dotenv from "dotenv";
dotenv.config();

const envVoiceServer = process.env.VOICEVOX_SERVER_URL;

const envSpeakerSpeedScaleUpperLimit = Number(process.env.SPEAKER_SPEED_SCALE_UPPER_LIMIT);
const envSpeakerSpeedScaleLowerLimit = Number(process.env.SPEAKER_SPEED_SCALE_LOWER_LIMIT);

const envSpeakerPitchScaleUpperLimit = Number(process.env.SPEAKER_PITCH_SCALE_UPPER_LIMIT);
const envSpeakerPitchScaleLowerLimit = Number(process.env.SPEAKER_PITCH_SCALE_LOWER_LIMIT);

const envSpeakerIntonationScaleUpperLimit = Number(process.env.SPEAKER_INTONATION_SCALE_UPPER_LIMIT);
const envSpeakerIntonationScaleLowerLimit = Number(process.env.SPEAKER_INTONATION_SCALE_LOWER_LIMIT);

const envSpeakerVolumeScaleUpperLimit = Number(process.env.SPEAKER_VOLUME_SCALE_UPPER_LIMIT);
const envSpeakerVolumeScaleLowerLimit = Number(process.env.SPEAKER_VOLUME_SCALE_LOWER_LIMIT);

const envSpeakerTempoDynamicsScaleUpperLimit = Number(process.env.SPEAKER_TEMPO_DYNAMICS_SCALE_UPPER_LIMIT);
const envSpeakerTempoDynamicsScaleLowerLimit = Number(process.env.SPEAKER_TEMPO_DYNAMICS_SCALE_LOWER_LIMIT);

const envAutocompleteLimit = parseInt(process.env.autocompleteLimit);

// デフォルト値
const defaultAudioQuery = {
    speedScale: 1,
    pitchScale: 0,
    intonationScale: 1,
    volumeScale: 1,
    tempoDynamicsScale: 1,
};

// 話者の情報を取得
const speakersWithStyles = (async () => {

    const result = [];

    const url = envVoiceServer;

    const response = await fetch(url + "/speakers", {
        headers: { "accept": "application/json" },
    });

    if (!response.ok) {
        throw new Error(`speakers API failed: ${response.status} ${response.statusText}`);
    }

    const speakers = await response.json();

    for (const speaker of speakers) {
        for (const style of speaker.styles) {

            result.push({
                "id": style.id,
                "speakerName": speaker.name,
                "styleName": style.name,
                "fqn": `${speaker.name}(${style.name})/${style.id}`
            });
        }
    }

    return result;
})();

export const data = new SlashCommandBuilder()
    .setName("tts")
    .setDescription("テキスト読み上げ")
    .addSubcommand(subCommand => subCommand
        .setName("on")
        .setDescription("テキスト読み上げを有効にします")
        .addStringOption(option => option
            .setName("id")
            .setDescription("話者")
            .setRequired(false)
        )
        .addChannelOption(option => option
            .setName("textchannel")
            .setDescription("テキストチャンネル")
            .setRequired(false)
        )
        .addChannelOption(option => option
            .setName("voicechannel")
            .setDescription("ボイスチャンネル")
            .setRequired(false)
        )
        .addNumberOption(option => option
            .setName("speed")
            .setDescription(`話速 (${envSpeakerSpeedScaleLowerLimit}～${envSpeakerSpeedScaleUpperLimit})`)
            .setRequired(false)
            .setMinValue(envSpeakerSpeedScaleLowerLimit)
            .setMaxValue(envSpeakerSpeedScaleUpperLimit)
        )
        .addNumberOption(option => option
            .setName("pitch")
            .setDescription(`音高 (${envSpeakerPitchScaleLowerLimit}～${envSpeakerPitchScaleUpperLimit})`)
            .setRequired(false)
            .setMinValue(envSpeakerPitchScaleLowerLimit)
            .setMaxValue(envSpeakerPitchScaleUpperLimit)
        )
        .addNumberOption(option => option
            .setName("intonation")
            .setDescription(`抑揚 (${envSpeakerIntonationScaleLowerLimit}～${envSpeakerIntonationScaleUpperLimit})`)
            .setRequired(false)
            .setMinValue(envSpeakerIntonationScaleLowerLimit)
            .setMaxValue(envSpeakerIntonationScaleUpperLimit)
        )
        .addNumberOption(option => option
            .setName("volume")
            .setDescription(`音量 (${envSpeakerVolumeScaleLowerLimit}～${envSpeakerVolumeScaleUpperLimit})`)
            .setRequired(false)
            .setMinValue(envSpeakerVolumeScaleLowerLimit)
            .setMaxValue(envSpeakerVolumeScaleUpperLimit)
        )
        .addNumberOption(option => option
            .setName("tempo")
            .setDescription(`緩急 (${envSpeakerTempoDynamicsScaleLowerLimit}～${envSpeakerTempoDynamicsScaleUpperLimit})`)
            .setRequired(false)
            .setMinValue(envSpeakerTempoDynamicsScaleLowerLimit)
            .setMaxValue(envSpeakerTempoDynamicsScaleUpperLimit)
        )
    )
    .addSubcommand(subCommand => subCommand
        .setName("off")
        .setDescription("テキスト読み上げを無効にします")
)
    .addSubcommand(subCommand => subCommand
        .setName("list")
        .setDescription("利用可能な話者一覧を表示します")
    )
    .addSubcommand(subCommand => subCommand
        .setName("param")
        .setDescription("読み上げのパラメータを設定します")
        .addStringOption(option => option
            .setName("speaker")
            .setDescription("話者")
            .setRequired(false)
        )
        .addNumberOption(option => option
            .setName("speed")
            .setDescription(`話速 (${envSpeakerSpeedScaleLowerLimit}～${envSpeakerSpeedScaleUpperLimit})`)
            .setRequired(false)
            .setMinValue(envSpeakerSpeedScaleLowerLimit)
            .setMaxValue(envSpeakerSpeedScaleUpperLimit)
        )
        .addNumberOption(option => option
            .setName("pitch")
            .setDescription(`音高 (${envSpeakerPitchScaleLowerLimit}～${envSpeakerPitchScaleUpperLimit})`)
            .setRequired(false)
            .setMinValue(envSpeakerPitchScaleLowerLimit)
            .setMaxValue(envSpeakerPitchScaleUpperLimit)
        )
        .addNumberOption(option => option
            .setName("intonation")
            .setDescription(`抑揚 (${envSpeakerIntonationScaleLowerLimit}～${envSpeakerIntonationScaleUpperLimit})`)
            .setRequired(false)
            .setMinValue(envSpeakerIntonationScaleLowerLimit)
            .setMaxValue(envSpeakerIntonationScaleUpperLimit)
        )
        .addNumberOption(option => option
            .setName("volume")
            .setDescription(`音量 (${envSpeakerVolumeScaleLowerLimit}～${envSpeakerVolumeScaleUpperLimit})`)
            .setRequired(false)
            .setMinValue(envSpeakerVolumeScaleLowerLimit)
            .setMaxValue(envSpeakerVolumeScaleUpperLimit)
        )
        .addNumberOption(option => option
            .setName("tempo")
            .setDescription(`緩急 (${envSpeakerTempoDynamicsScaleLowerLimit}～${envSpeakerTempoDynamicsScaleUpperLimit})`)
            .setRequired(false)
            .setMinValue(envSpeakerTempoDynamicsScaleLowerLimit)
            .setMaxValue(envSpeakerTempoDynamicsScaleUpperLimit)
        )
    )
    .addSubcommand(subCommand => subCommand
        .setName("speaker")
        .setDescription("読み上げの設定を行います")
        .addStringOption(option => option
            .setName("id")
            .setDescription("話者")
            .setRequired(true)
        )
    )
    .addSubcommand(subCommand => subCommand
        .setName("speed")
        .setDescription("読み上げの速度を設定します")
        .addNumberOption(option => option
            .setName("scale")
            .setDescription(`速度倍率 (${envSpeakerSpeedScaleLowerLimit}～${envSpeakerSpeedScaleUpperLimit})`)
            .setRequired(true)
            .setMinValue(envSpeakerSpeedScaleLowerLimit)
            .setMaxValue(envSpeakerSpeedScaleUpperLimit)
        )
    )
    .addSubcommand(subCommand => subCommand
        .setName("pitch")
        .setDescription("読み上げの音高を設定します")
        .addNumberOption(option => option
            .setName("scale")
            .setDescription(`音高倍率 (${envSpeakerPitchScaleLowerLimit}～${envSpeakerPitchScaleUpperLimit})`)
            .setRequired(true)
            .setMinValue(envSpeakerPitchScaleLowerLimit)
            .setMaxValue(envSpeakerPitchScaleUpperLimit)
        )
    )
    .addSubcommand(subCommand => subCommand
        .setName("intonation")
        .setDescription("読み上げの抑揚を設定します")
        .addNumberOption(option => option
            .setName("scale")
            .setDescription(`抑揚倍率 (${envSpeakerIntonationScaleLowerLimit}～${envSpeakerIntonationScaleUpperLimit})`)
            .setRequired(true)
            .setMinValue(envSpeakerIntonationScaleLowerLimit)
            .setMaxValue(envSpeakerIntonationScaleUpperLimit)
        )
    )
    .addSubcommand(subCommand => subCommand
        .setName("volume")
        .setDescription("読み上げの音量を設定します")
        .addNumberOption(option => option
            .setName("scale")
            .setDescription(`音量倍率 (${envSpeakerVolumeScaleLowerLimit}～${envSpeakerVolumeScaleUpperLimit})`)
            .setRequired(true)
            .setMinValue(envSpeakerVolumeScaleLowerLimit)
            .setMaxValue(envSpeakerVolumeScaleUpperLimit)
        )
    )
    .addSubcommand(subCommand => subCommand
        .setName("tempo")
        .setDescription("読み上げのテンポを設定します")
        .addNumberOption(option => option
            .setName("scale")
            .setDescription(`テンポ倍率 (${envSpeakerTempoDynamicsScaleLowerLimit}～${envSpeakerTempoDynamicsScaleUpperLimit})`)
            .setRequired(true)
            .setMinValue(envSpeakerTempoDynamicsScaleLowerLimit)
            .setMaxValue(envSpeakerTempoDynamicsScaleUpperLimit)
        )
    )
    .addSubcommand(subCommand => subCommand
        .setName("channel")
        .setDescription("読み上げに使用するチャンネルを設定します")
        .addChannelOption(option => option
            .setName("textchannel")
            .setDescription("テキストチャンネル")
            .setRequired(true)
        )
    )
    .addSubcommand(subCommand => subCommand
        .setName("info")
        .setDescription("TTS機能の情報を表示します")
    )
    .addSubcommand(subCommand => subCommand
        .setName("help")
        .setDescription("使い方を表示します")
    );

export async function execute(interaction, data) {
    console.log('[TTS] execute called', { subCommand: interaction.options.getSubcommand(), user: interaction.user?.id });
    const subCommand = interaction.options.getSubcommand();

    if (subCommand == "on") {
        const textCannelId = interaction.options.getChannel("textchannel")?.id;
        let voiceCannelId = interaction.options.getChannel("voicechannel")?.id;
        const adapterCreator = interaction.guild.voiceAdapterCreator;
        const guildId = interaction.guildId;

        // voiceCannelIdが未指定の場合、実行者の参加しているボイスチャンネルを取得
        if (!voiceCannelId) {
            const member = interaction.guild.members.cache.get(interaction.member.id);
            const userVoiceChannel = member?.voice?.channel;
            if (userVoiceChannel) {
                voiceCannelId = userVoiceChannel.id;
            } else {
                await interaction.reply("ボイスチャンネルが指定されていません。");
                return;
            }
        }

        const connection = joinVoiceChannel({
            "channelId": voiceCannelId,
            "guildId": guildId,
            "adapterCreator": adapterCreator,
            "selfMute": false,
            "selfDeaf": false
        });

        if (!connection) {
            await interaction.reply("接続に失敗しました");
            return;
        }

        const player = createAudioPlayer({
            "behaviors": {
                "noSubscriber": NoSubscriberBehavior.Pause,
            },
        });

        if (!player) {
            connection.destroy();
            await interaction.reply("プレイヤーの生成に失敗しました");
            return;
        }

        const subscribe = connection.subscribe(player);
        if (!subscribe) {
            connection.destroy();
            await interaction.reply("音声チャンネルへのプレイヤーの接続に失敗しました");
            return;
        }

        if (!data.restoreConfig(guildId)) {
            // デフォルトデータ新規作成
            data.initGuildConfigIfUndefined(guildId);
            data.saveConfig(guildId);
        }

        const guildConfig = data.initGuildConfigIfUndefined(guildId);
        // textCannelIdが未指定の場合はeditDataから取得
        const ttsChannel = data.GuildConfigs[guildId]?.tts?.textChannelId;
        // textCannelIdが未指定の場合はeditDataから取得
        if (textCannelId) {
            guildConfig.tts.textChannelId = textCannelId;
        } else if (!guildConfig.tts.textChannelId || guildConfig.tts.textChannelId === "") {
            // 既存設定も空なら、コマンド実行チャンネルを設定
            guildConfig.tts.textChannelId = interaction.channelId;
        } else if (ttsChannel) {
            guildConfig.tts.textChannelId = ttsChannel;
        }

        guildConfig.tts.voiceChannelId = voiceCannelId;
        // textChannelIdを保存
        data.saveConfig(guildId);

        if (!data.restoreDictionary(guildId)) {
            // デフォルト辞書新規作成
            data.initGuildDictionaryIfUndefined(guildId);
            data.saveDictionary(guildId);
        }

        // ここから話者IDの設定処理
        const speakerId = interaction.options.getString("id");
        let speaker;

        if (speakerId) {
            const speakers = await speakersWithStyles;
            speaker = speakers.find(x => String(x.id) === String(speakerId));
            if (speaker) {
                const memberId = interaction.member.id;
                const memberSpeakerConfig = data.initMemberSpeakerConfig(guildId, memberId);
                memberSpeakerConfig.id = speaker.id;
            } else {
                await interaction.reply(`指定された話者ID（${speakerId}）は見つかりませんでした。`);
                return;
            }
        }

        const textChannel = interaction.options.getChannel("textchannel");
        if (textChannel) {
            if (textChannel.type !== ChannelType.GuildText) {
                connection.destroy();
                await interaction.reply("テキストチャンネルの指定が不正です");
                return;
            }
            guildConfig.textChannelId = textChannel.id;

            console.log(`[TTS] Set text channel: ${textChannel.id}`);
        }

        const voiceChannel = interaction.options.getChannel("voicechannel");
        if (voiceChannel) {
            if (voiceChannel.type !== ChannelType.GuildVoice) {
                connection.destroy();
                await interaction.reply("ボイスチャンネルの指定が不正です");
                return;
            }
            guildConfig.voiceChannelId = voiceChannel.id;
            console.log(`[TTS] Set voice channel: ${voiceChannel.id}`);
        }

        data.saveConfig(guildId);

        const memberId = interaction.member.id;
        const memberSpeakerConfig = data.initMemberSpeakerConfigIfUndefined(guildId, memberId);
        const speakerlist = await speakersWithStyles;
        speaker = speakerlist.find(x => String(x.id) === String(memberSpeakerConfig.id));

        // コマンド実行者の話者設定があれば優先して適用、なければデフォルト話者を設定
        if (!speaker.speakerName || !speaker.styleName) {
            const defaultSpeaker = speakerlist.find(x => String(x.id) === String(process.env.DEFAULT_SPEAKER_ID));
            speaker.speakerName = defaultSpeaker ? defaultSpeaker.speakerName : "デフォルト";
            speaker.styleName = defaultSpeaker ? defaultSpeaker.styleName : "";
        }

        // パラメータの設定
        memberSpeakerConfig.speedScale = interaction.options.getNumber("speed") ?? memberSpeakerConfig.speedScale ?? defaultAudioQuery.speedScale;
        memberSpeakerConfig.pitchScale = interaction.options.getNumber("pitch") ?? memberSpeakerConfig.pitchScale ?? defaultAudioQuery.pitchScale;
        memberSpeakerConfig.intonationScale = interaction.options.getNumber("intonation") ?? memberSpeakerConfig.intonationScale ?? defaultAudioQuery.intonationScale;
        memberSpeakerConfig.volumeScale = interaction.options.getNumber("volume") ?? memberSpeakerConfig.volumeScale ?? defaultAudioQuery.volumeScale;
        memberSpeakerConfig.tempoDynamicsScale = interaction.options.getNumber("tempo") ?? memberSpeakerConfig.tempoDynamicsScale ?? defaultAudioQuery.tempoDynamicsScale;

        await interaction.reply("読み上げボットを接続しました");

        const queue = data.initGuildQueueIfUndefined(guildId);
        const testText = "読み上げが有効になりました";
        await TextToSpeech([testText], memberSpeakerConfig, player, queue);
        return;
    }

    if (subCommand == "off") {
        const guildId = interaction.guildId;

        const connection = getVoiceConnection(guildId);

        if (!connection) {
            interaction.reply("通話に参加していません");

            return;
        }

        connection.state.subscription.player.stop();
        connection.destroy();

        data.saveConfig(guildId);
        data.saveDictionary(guildId);

        await interaction.reply("読み上げボットを切断します");

        return;
    }

    if (subCommand == "list") {
        let list = "";

        const speakers = await speakersWithStyles;

        for (const speaker of speakers) {
            list += speaker.fqn + "\r\n";
        }

        const buffer = Buffer.from(list);
        const attachment = new AttachmentBuilder(buffer, { "name": "speakers.txt" });

        await interaction.reply({ "content": "話者IDの一覧を作成しました", "files": [attachment] });

        return;
    }

    if (subCommand == "speaker") {

        const guildId = interaction.guildId;

        const connection = getVoiceConnection(guildId);

        if (!connection) {
            await interaction.reply("通話に参加していません");

            return;
        }

        const id = interaction.options.getString("id").trim();

        const speakers = await speakersWithStyles;

        const speaker = speakers.find(
            (x) => {
                if (parseInt(id) !== x.id || id === `${x.speakerName}(${x.styleName})`) return false;

                return true;
            }
        );

        if (!speaker) {
            await interaction.reply("話者の指定が不正です");

            return;
        }

        const memberId = interaction.member.id;
        const memberName = interaction.member.displayName + "さん";

        const memberSpeakerConfig = data.initMemberSpeakerConfigIfUndefined(guildId, memberId);

        memberSpeakerConfig.engine = speaker.engine;
        memberSpeakerConfig.id = speaker.id;

        data.saveConfig(guildId);

        const message = `${memberName}の話者を「${speaker.fqn}」に変更しました`;

        await interaction.reply(message);

        return;
    }

    if (subCommand == "param") {
        const guildId = interaction.guildId;
        const memberId = interaction.member.id;
        const memberSpeakerConfig = data.initMemberSpeakerConfigIfUndefined(guildId, memberId);
        const fqn = memberSpeakerConfig.speakerName && memberSpeakerConfig.styleName ? `${memberSpeakerConfig.speakerName}(${memberSpeakerConfig.styleName})` : null;

        if (interaction.options.getString("speaker")) {
            const speakers = await speakersWithStyles;
            const id = interaction.options.getString("speaker").trim();

            const speaker = speakers.find(
                (x) => {
                    if (parseInt(id) !== x.id || id === `${x.speakerName}(${x.styleName})`) return false;

                    return true;
                }
            );

            if (!speaker) {
                await interaction.reply("話者の指定が不正です");

                return;
            }

            const memberId = interaction.member.id;

            const memberSpeakerConfig = data.initMemberSpeakerConfigIfUndefined(guildId, memberId);

            memberSpeakerConfig.engine = speaker.engine;
            memberSpeakerConfig.id = speaker.id;

            fqn = speaker.fqn;
        }

        // 入力値があれば反映、なければデフォルト値
        memberSpeakerConfig.speedScale = interaction.options.getNumber("speed") ?? defaultAudioQuery.speedScale;
        memberSpeakerConfig.pitchScale = interaction.options.getNumber("pitch") ?? defaultAudioQuery.pitchScale;
        memberSpeakerConfig.intonationScale = interaction.options.getNumber("intonation") ?? defaultAudioQuery.intonationScale;
        memberSpeakerConfig.volumeScale = interaction.options.getNumber("volume") ?? defaultAudioQuery.volumeScale;
        memberSpeakerConfig.tempoDynamicsScale = interaction.options.getNumber("tempo") ?? defaultAudioQuery.tempoDynamicsScale;

        data.saveConfig(guildId);
        await interaction.reply(`パラメータを設定しました\n話者:${fqn}\n話速:${memberSpeakerConfig.speedScale} 音高:${memberSpeakerConfig.pitchScale} 抑揚:${memberSpeakerConfig.intonationScale} 音量:${memberSpeakerConfig.volumeScale} 緩急:${memberSpeakerConfig.tempoDynamicsScale}`);
        return;
    }

    if (subCommand == "speed") {
        const guildId = interaction.guildId;

        const connection = getVoiceConnection(guildId);

        if (!connection) {
            await interaction.reply("通話に参加していません");

            return;
        }

        const memberId = interaction.member.id;
        const memberName = interaction.member.displayName;

        const memberSpeakerConfig = data.initMemberSpeakerConfigIfUndefined(guildId, memberId);

        const currentScale = memberSpeakerConfig.speedScale;

        const scale = clamp(
            interaction.options.getNumber("scale") ?? currentScale,
            envSpeakerSpeedScaleLowerLimit,
            envSpeakerSpeedScaleUpperLimit
        );

        memberSpeakerConfig.speedScale = scale;

        const message = createSpeakerSettingMessage(memberName, memberSpeakerConfig);

        data.saveConfig(guildId);
        await interaction.reply(message);
        return;
    }

    if (subCommand == "pitch") {
        const guildId = interaction.guildId;

        const connection = getVoiceConnection(guildId);

        if (!connection) {
            await interaction.reply("通話に参加していません");
            return;
        }

        const memberId = interaction.member.id;
        const memberName = interaction.member.displayName;

        const memberSpeakerConfig = data.initMemberSpeakerConfigIfUndefined(guildId, memberId);

        const currentScale = memberSpeakerConfig.pitchScale;

        const scale = clamp(
            interaction.options.getNumber("scale") ?? currentScale,
            envSpeakerPitchScaleLowerLimit,
            envSpeakerPitchScaleUpperLimit
        );

        memberSpeakerConfig.pitchScale = scale;

        const message = createSpeakerSettingMessage(memberName, memberSpeakerConfig);

        data.saveConfig(guildId);
        await interaction.reply(message);

        return;
    }

    if (subCommand == "intonation") {
        const guildId = interaction.guildId;

        const connection = getVoiceConnection(guildId);

        if (!connection) {
            await interaction.reply("通話に参加していません");
            return;
        }

        const memberId = interaction.member.id;
        const memberName = interaction.member.displayName;

        const memberSpeakerConfig = data.initMemberSpeakerConfigIfUndefined(guildId, memberId);

        const currentScale = memberSpeakerConfig.intonationScale;

        const scale = clamp(
            interaction.options.getNumber("scale") ?? currentScale,
            envSpeakerIntonationScaleLowerLimit,
            envSpeakerIntonationScaleUpperLimit
        );

        memberSpeakerConfig.intonationScale = scale;

        const message = createSpeakerSettingMessage(memberName, memberSpeakerConfig);

        data.saveConfig(guildId);
        await interaction.reply(message);
        return;
    }

    if (subCommand == "volume") {
        const guildId = interaction.guildId;

        const connection = getVoiceConnection(guildId);

        if (!connection) {
            await interaction.reply("通話に参加していません");
            return;
        }

        const memberId = interaction.member.id;
        const memberName = interaction.member.displayName;

        const memberSpeakerConfig = data.initMemberSpeakerConfigIfUndefined(guildId, memberId);

        const currentScale = memberSpeakerConfig.volumeScale;

        const scale = clamp(
            interaction.options.getNumber("scale") ?? currentScale,
            envSpeakerVolumeScaleLowerLimit,
            envSpeakerVolumeScaleUpperLimit
        );

        memberSpeakerConfig.volumeScale = scale;

        const message = createSpeakerSettingMessage(memberName, memberSpeakerConfig);

        data.saveConfig(guildId);
        await interaction.reply(message);
        return;
    }

    if (subCommand == "tempo") {
        const guildId = interaction.guildId;

        const connection = getVoiceConnection(guildId);

        if (!connection) {
            await interaction.reply("通話に参加していません");
            return;
        }

        const memberId = interaction.member.id;
        const memberName = interaction.member.displayName;

        const memberSpeakerConfig = data.initMemberSpeakerConfigIfUndefined(guildId, memberId);

        const currentScale = memberSpeakerConfig.tempoDynamicsScale;

        const scale = clamp(
            interaction.options.getNumber("scale") ?? currentScale,
            envSpeakerTempoDynamicsScaleLowerLimit,
            envSpeakerTempoDynamicsScaleUpperLimit
        );

        memberSpeakerConfig.tempoDynamicsScale = scale;

        const message = createSpeakerSettingMessage(memberName, memberSpeakerConfig);

        data.saveConfig(guildId);
        await interaction.reply(message);
        return;
    }

    if (subCommand == "help") {
        let message = `【TTSコマンド詳細】\n\n` +
            `/tts on [id] : 読み上げを有効化。話者IDを指定可能。\n  例: /tts on id:2\n\n` +
            `/tts off : 読み上げを無効化し、ボイスチャンネルから退出。\n\n` +
            `/tts list : 利用可能な話者一覧を表示。\n\n` +
            `/tts speaker id:[話者ID] : 話者を変更。\n  例: /tts speaker id:2\n\n` +
            `/tts speed scale:[倍率] : 話速を変更。1=標準\n  例: /tts speed scale:1.2\n\n` +
            `/tts pitch scale:[倍率] : 音高を変更。0=標準\n  例: /tts pitch scale:0.5\n\n` +
            `/tts intonation scale:[倍率] : 抑揚を変更。1=標準\n  例: /tts intonation scale:1.1\n\n` +
            `/tts volume scale:[倍率] : 音量を変更。1=標準\n  例: /tts volume scale:1.0\n\n` +
            `/tts tempo scale:[倍率] : 緩急(テンポ)を変更。1=標準\n  例: /tts tempo scale:1.0\n\n` +
            `/tts channel text:[チャンネル] : 読み上げ対象テキストチャンネルを設定\n\n` +
            `/tts param speed:[話速] pitch:[音高] intonation:[抑揚] volume:[音量] tempo:[緩急] : パラメータを一括設定。未入力はデフォルト値\n  例: /tts audioquery speed:1.2 pitch:0.5 intonation:1 volume:1 tempo:1\n\n`;
        await interaction.reply(message);
        return;
    }

    if (subCommand == "info") {
        const memberId = interaction.member.id;
        const guildId = interaction.guildId;
        const memberSpeakerConfig = data.initMemberSpeakerConfigIfUndefined(guildId, memberId);

        let speakerlist = await speakersWithStyles;
        let speaker = speakerlist.find(x => String(x.id) === String(memberSpeakerConfig.id));

        let message = `${interaction.client.user.username}のTTS機能の情報です\n\n` +
            `話者: ${speaker.fqn}\n` +
            `話速: ${memberSpeakerConfig.speedScale}\n` +
            `音高: ${memberSpeakerConfig.pitchScale}\n` +
            `抑揚: ${memberSpeakerConfig.intonationScale}\n` +
            `音量: ${memberSpeakerConfig.volumeScale}\n` +
            `緩急: ${memberSpeakerConfig.tempoDynamicsScale}\n\n`;

        interaction.reply(message);
        return;
    }

    if (subCommand == "channel") {
        const channel = interaction.options.getChannel("text");
        const guildId = interaction.guildId;
        const guildConfig = data.initGuildConfigIfUndefined(guildId);

        if (channel == null) {
            await interaction.reply("読み上げは全てのチャンネルで動作します");
            return;
        }

        if (channel.id === guildConfig.dice.textChannelId) {
            await interaction.reply("読み上げにダイスチャンネルは指定できません");
            return;
        }
        guildConfig.textChannelId = channel.id;
        data.saveConfig(guildId);

        await interaction.reply("読み上げのテキストチャンネルを" + channel.name + "に設定しました");
        return;
    }
}

function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
}

function createSpeakerSettingMessage(memberName, memberSpeakerConfig) {
    return `${memberName}さんの話者を「` +
        `#話速:${String(memberSpeakerConfig.speedScale)}` + " " +
        `#音高:${String(memberSpeakerConfig.pitchScale)}` + " " +
        `#抑揚:${String(memberSpeakerConfig.intonationScale)}` + " " +
        `#音量:${String(memberSpeakerConfig.volumeScale)}` + " " +
        `#緩急:${String(memberSpeakerConfig.tempoDynamicsScale)}` +
        `」に設定しました`;
}