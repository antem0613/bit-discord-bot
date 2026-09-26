import fs from 'fs';
import crypto from 'crypto';
import dotenv from 'dotenv';
dotenv.config();

const envDefaultSpeakerEngine = process.env.DEFAULT_SPEAKER_ENGINE;
const envDefaultSpeakerId = parseInt(process.env.DEFAULT_SPEAKER_ID);
const envDefaultSpeakerSpeedScale = Number(process.env.DEFAULT_SPEAKER_SPEED_SCALE);
const envDefaultSpeakerPitchScale = Number(process.env.DEFAULT_SPEAKER_PITCH_SCALE);
const envDefaultSpeakerIntonationScale = Number(process.env.DEFAULT_SPEAKER_INTONATION_SCALE);
const envDefaultSpeakerVolumeScale = Number(process.env.DEFAULT_SPEAKER_VOLUME_SCALE);
const envDefaultSpeakerTempoDynamicsScale = Number(process.env.DEFAULT_SPEAKER_TEMPO_DYNAMICS_SCALE);
const envGuildConfigsDir = process.env.GUILD_CONFIGS_DIR || './guild_configs';
const envGuildDictionariesDir = process.env.GUILD_DICTIONARIES_DIR || './guild_dictionaries';

class EditData {
    constructor() {
        this.GuildConfigs = {};
        this.GuildDictionaries = {};
        this.GuildQueues = {};
    }

    // ギルド設定（TTS+Dice）初期化
    initGuildConfigIfUndefined(guildId) {
        if (!this.GuildConfigs[guildId]) {
            this.GuildConfigs[guildId] = {
                tts: {
                    textChannelId: "",
                    voiceChannelId: "",
                    isReactionSpeach: true,
                    excludeRegEx: "(?!)",
                    memberSpeakerConfigs: {}
                },
                dice: {
                    diceChannel: null,
                    system: "DiceBot"
                }
            };
        } else {
            this.GuildConfigs[guildId].tts.textChannelId ??= "";
            this.GuildConfigs[guildId].tts.voiceChannelId ??= "";
            this.GuildConfigs[guildId].tts.isReactionSpeach ??= true;
            this.GuildConfigs[guildId].tts.excludeRegEx ??= "(?!)";
            this.GuildConfigs[guildId].tts.memberSpeakerConfigs ??= {};
            this.GuildConfigs[guildId].dice.diceChannel ??= null;
            this.GuildConfigs[guildId].dice.system ??= "DiceBot";
        }
        return this.GuildConfigs[guildId];
    }
    initMemberSpeakerConfigIfUndefined(guildId, memberId) {
        this.initGuildConfigIfUndefined(guildId);
        const ttsConfig = this.GuildConfigs[guildId].tts;
        ttsConfig.memberSpeakerConfigs[memberId] ??= {};
        ttsConfig.memberSpeakerConfigs[memberId].engine ??= envDefaultSpeakerEngine;
        ttsConfig.memberSpeakerConfigs[memberId].id ??= envDefaultSpeakerId;
        ttsConfig.memberSpeakerConfigs[memberId].speedScale ??= envDefaultSpeakerSpeedScale;
        ttsConfig.memberSpeakerConfigs[memberId].pitchScale ??= envDefaultSpeakerPitchScale;
        ttsConfig.memberSpeakerConfigs[memberId].intonationScale ??= envDefaultSpeakerIntonationScale;
        ttsConfig.memberSpeakerConfigs[memberId].volumeScale ??= envDefaultSpeakerVolumeScale;
        ttsConfig.memberSpeakerConfigs[memberId].tempoDynamicsScale ??= envDefaultSpeakerTempoDynamicsScale;
        return ttsConfig.memberSpeakerConfigs[memberId];
    }
    initGuildDictionaryIfUndefined(guildId) {
        if (!this.GuildDictionaries[guildId]) {
            this.GuildDictionaries[guildId] = {};
        }
        return this.GuildDictionaries[guildId];
    }
    initGuildQueueIfUndefined(guildId) {
        if (!this.GuildQueues[guildId]) {
            this.GuildQueues[guildId] = [];
        }
        return this.GuildQueues[guildId];
    }
    // ギルド設定保存
    saveConfig(guildId) {
        const config = this.GuildConfigs[guildId];
        if (!config) return false;
        try {
            fs.writeFileSync(`${envGuildConfigsDir}/${guildId}.json`, JSON.stringify(config, null, 2));
            return true;
        } catch (e) {
            console.error(`[Guild] saveConfig error:`, e);
            return false;
        }
    }
    restoreConfig(guildId) {
        try {
            const file = `${envGuildConfigsDir}/${guildId}.json`;
            if (!fs.existsSync(file)) return false;
            const config = JSON.parse(fs.readFileSync(file));
            this.GuildConfigs[guildId] = config;
            return true;
        } catch (e) {
            console.error(`[Guild] restoreConfig error:`, e);
            return false;
        }
    }
    saveDictionary(guildId) {
        const dict = this.GuildDictionaries[guildId];
        if (!dict) return false;
        try {
            fs.writeFileSync(`${envGuildDictionariesDir}/${guildId}.json`, JSON.stringify(dict, null, 2));
            return true;
        } catch (e) {
            console.error(`[Guild] saveDictionary error:`, e);
            return false;
        }
    }
    restoreDictionary(guildId) {
        try {
            const file = `${envGuildDictionariesDir}/${guildId}.json`;
            if (!fs.existsSync(file)) return false;
            const dict = JSON.parse(fs.readFileSync(file));
            this.GuildDictionaries[guildId] = dict;
            return true;
        } catch (e) {
            console.error(`[Guild] restoreDictionary error:`, e);
            return false;
        }
    }
    deleteGuildData(guildId) {
        delete this.GuildConfigs[guildId];
        delete this.GuildDictionaries[guildId];
        delete this.GuildQueues[guildId];
        try {
            if (fs.existsSync(`${envGuildConfigsDir}/${guildId}.json`)) fs.unlinkSync(`${envGuildConfigsDir}/${guildId}.json`);
            if (fs.existsSync(`${envGuildDictionariesDir}/${guildId}.json`)) fs.unlinkSync(`${envGuildDictionariesDir}/${guildId}.json`);
        } catch (e) {
            console.error(`[Guild] deleteGuildData error:`, e);
        }
    }

    // Dice用個別初期化は不要（統合済み）

    // 共通の保存・読込
    saveData() {
        for (const guildId of Object.keys(this.GuildConfigs)) {
            this.saveConfig(guildId);
            this.saveDictionary(guildId);
        }
    }
    loadData() {
        if (!fs.existsSync(envGuildConfigsDir)) return;
        for (const file of fs.readdirSync(envGuildConfigsDir)) {
            if (file.endsWith('.json')) {
                const guildId = file.replace('.json', '');
                this.restoreConfig(guildId);
            }
        }
        if (fs.existsSync(envGuildDictionariesDir)) {
            for (const file of fs.readdirSync(envGuildDictionariesDir)) {
                if (file.endsWith('.json')) {
                    const guildId = file.replace('.json', '');
                    this.restoreDictionary(guildId);
                }
            }
        }
    }
    checkExist() {
        return fs.existsSync(envGuildConfigsDir);
    }
    createData() {
        if (!fs.existsSync(envGuildConfigsDir)) fs.mkdirSync(envGuildConfigsDir);
        if (!fs.existsSync(envGuildDictionariesDir)) fs.mkdirSync(envGuildDictionariesDir);
        // 統合ギルド初期化（default guild）
        const guildId = 'default';
        this.GuildConfigs[guildId] = {
            tts: {
                textChannelId: null,
                voiceChannelId: null,
                isReactionSpeach: true,
                excludeRegEx: "",
                memberSpeakerConfigs: {}
            },
            dice: {
                diceChannel: null,
                system: "DiceBot"
            }
        };
        this.saveConfig(guildId);
        this.GuildDictionaries[guildId] = {};
        this.saveDictionary(guildId);
        this.GuildQueues[guildId] = [];
    }
}

const editData = new EditData();
export { editData };
export const checkExist = () => editData.checkExist();
export const loadData = () => editData.loadData();
export const createData = () => editData.createData();
export const saveData = () => editData.saveData();