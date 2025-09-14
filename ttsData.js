import dotenv from "dotenv";
import fs from "fs";
import crypto from "crypto";
dotenv.config();

const envDefaultSpeakerEngine = process.env.defaultSpeakerEngine;
const envDefaultSpeakerId     = parseInt(process.env.defaultSpeakerId);

const envDefaultSpeakerSpeedScale          = Number(process.env.defaultSpeakerSpeedScale);
const envDefaultSpeakerPitchScale          = Number(process.env.defaultSpeakerPitchScale);
const envDefaultSpeakerIntonationScale     = Number(process.env.defaultSpeakerIntonationScale);
const envDefaultSpeakerVolumeScale         = Number(process.env.defaultSpeakerVolumeScale);
const envDefaultSpeakerTempoDynamicsScale  = Number(process.env.defaultSpeakerTempoDynamicsScale);

const envGuildConfigsDir      = process.env.guildConfigsDir;
const envGuildDictionariesDir = process.env.guildDictionariesDir;

/**
 * グローバルデータを管理するクラス
 */
function ttsData(){
    this.GuildConfigs      = {};
    this.GuildDictionaries = {};
    this.GuildQueues       = {};
}

/**
 * ギルド設定を取得する(未定義の場合は初期化を実施)
 * @param {string} guildId - ギルドID
 * @returns {object} - ギルド設定
 */
ttsData.prototype.initGuildConfigIfUndefined = function(guildId){
    this.GuildConfigs[guildId] ??= {};

    this.GuildConfigs[guildId].textChannelId        ??= "";
    this.GuildConfigs[guildId].voiceChannelId       ??= "";
    this.GuildConfigs[guildId].isReactionSpeach     ??= true;
    this.GuildConfigs[guildId].excludeRegEx         ??= "(?!)";
    this.GuildConfigs[guildId].memberSpeakerConfigs ??= {};

    return this.GuildConfigs[guildId];
}

/**
 * ギルド設定を初期化する
 * @param {string} guildId - ギルドID
 * @returns {object} - ギルド設定
 */
ttsData.prototype.initGuildConfig = function(guildId){
    this.GuildConfigs[guildId] = {};

    return this.initGuildConfigIfUndefined(guildId);
}

/**
 * メンバーのスピーカー設定を取得する(未定義の場合は初期化を実施)
 * @param {string} guildId - ギルドID
 * @param {string} memberId - メンバーID
 * @returns {object} - メンバーのスピーカー設定
 */
ttsData.prototype.initMemberSpeakerConfigIfUndefined = function(guildId, memberId){
    this.initGuildConfigIfUndefined(guildId);

    this.GuildConfigs[guildId].memberSpeakerConfigs[memberId] ??= {};

    this.GuildConfigs[guildId].memberSpeakerConfigs[memberId].engine ??= envDefaultSpeakerEngine;
    this.GuildConfigs[guildId].memberSpeakerConfigs[memberId].id     ??= envDefaultSpeakerId;

    // nullはdefault値として扱う(audio_queryを書き換えない)
    this.GuildConfigs[guildId].memberSpeakerConfigs[memberId].speedScale         ??= envDefaultSpeakerSpeedScale;
    this.GuildConfigs[guildId].memberSpeakerConfigs[memberId].pitchScale         ??= envDefaultSpeakerPitchScale;
    this.GuildConfigs[guildId].memberSpeakerConfigs[memberId].intonationScale    ??= envDefaultSpeakerIntonationScale;
    this.GuildConfigs[guildId].memberSpeakerConfigs[memberId].volumeScale        ??= envDefaultSpeakerVolumeScale;
    this.GuildConfigs[guildId].memberSpeakerConfigs[memberId].tempoDynamicsScale ??= envDefaultSpeakerTempoDynamicsScale;

    return this.GuildConfigs[guildId].memberSpeakerConfigs[memberId];
}

/**
 * メンバーのスピーカーを初期化する
 * @param {string} guildId - ギルドID
 * @param {string} memberId - メンバーID
 * @returns {object} - メンバーのスピーカー設定
 */
ttsData.prototype.initMemberSpeakerConfig = function(guildId, memberId){
    this.initGuildConfigIfUndefined(guildId);

    this.GuildConfigs[guildId].memberSpeakerConfigs[memberId] = {};

    return this.initMemberSpeakerConfigIfUndefined(guildId, memberId);
}

/**
 * ギルドの辞書を取得する(未定義の場合は初期化を実施)
 * @param {string} guildId - ギルドID
 * @returns {object} - ギルドの辞書
 */
ttsData.prototype.initGuildDictionaryIfUndefined = function(guildId){
    this.GuildDictionaries[guildId] ??= {};

    return this.GuildDictionaries[guildId];
}

/**
 * ギルドの辞書を初期化する
 * @param {string} guildId - ギルドID
 * @returns {object} - ギルドの辞書
 */
ttsData.prototype.initGuildDictionary = function(guildId){
    this.GuildDictionaries[guildId] = {};

    return this.initGuildDictionaryIfUndefined(guildId);
}

/**
 * ギルドのキューを取得する(未定義の場合は初期化を実施)
 * @param {string} guildId - ギルドID
 * @returns {object} - ギルドのキュー
 */
ttsData.prototype.initGuildQueueIfUndefined = function(guildId){
    this.GuildQueues[guildId] ??= [];

    return this.GuildQueues[guildId];
}

/**
 * ギルドのキューを初期化する
 * @param {string} guildId - ギルドID
 * @returns {object} - ギルドのキュー
 */
ttsData.prototype.initGuildQueue = function(guildId){
    this.GuildQueues[guildId] = [];

    return this.initGuildQueueIfUndefined(guildId);
}

/**
 * 設定/辞書を復元する(内部処理用)
 * @param {string} guildId - ギルドID
 * @param {string} path - ファイルパス
 * @param {object} target - 保存するオブジェクト(this.zBotGuildConfigs or this.zBotGuildDictionaries)
 * @param {function} initFunc - 初期化する関数(this.initGuildConfigIfUndefined or this.initGuildDictionaryIfUndefined)
 */
ttsData.prototype.restoreData = function(guildId, path, target, initFunc){
    try{
        const json = fs.readFileSync(path);
        const obj = JSON.parse(json);

        // 読み込んだデータを元にハッシュ値を計算し、obj.__hash__ に設定(整合性確認用)
        const hash = crypto.createHash("sha256").update(json).digest("hex");
        obj.__hash__ = hash;

        target[guildId] = obj;
    }catch(e){
         // エラーコードがENOENTの場合、ファイルが存在しないので、初期化処理を行う
        if(e.code === "ENOENT"){
            // 初期化関数を実行
            initFunc.call(this, guildId);

            const obj = target[guildId];
            const json = JSON.stringify(obj);

            fs.writeFileSync(path, json);

            // 保存した文字列を元にハッシュ値を計算し、obj.__hash__ に設定(整合性確認用)
            const hash = crypto.createHash("sha256").update(json).digest("hex");
            obj.__hash__ = hash;
        }else{
            throw new Error(`Failed to read or parse file: ${path} (Guild: ${guildId}). Details: ${e.message}`);
        }
    }
    
    return true;
}

/**
 * 設定/辞書を保存する(内部処理用)
 * @param {string} guildId - ギルドID
 * @param {string} path - ファイルパス
 * @param {object} target - 保存するオブジェクト(this.zBotGuildConfigs or this.zBotGuildDictionaries)
 */
ttsData.prototype.saveData = function(guildId, path, target){
    try{
        const obj  = target[guildId];
        const hash1 = obj.__hash__;
    
        const json = fs.readFileSync(path);
        const hash2 = crypto.createHash("sha256").update(json).digest("hex");
    
        // 事前に取得したハッシュ値と現在のファイルのハッシュ値が一致しない場合(データが変更されている)
        if(hash1 !== hash2){
            // return false;
            throw new Error(`Data mismatch for guild ${guildId}: expected hash ${hash1}, got ${hash2}`);
        }
    
        delete obj.__hash__;
        fs.writeFileSync(path, JSON.stringify(obj));
    }catch(e){
        throw new Error(`Failed to save file: ${path} (Guild: ${guildId}). Details: ${e.message}`);
    }

    return true;
}

/**
 * ギルドの設定を復元する
 * @param {string} guildId - ギルドID
 */
ttsData.prototype.restoreConfig = function(guildId){
    const path = envGuildConfigsDir + "/" + String(guildId) + ".json";
    return this.restoreData(guildId, path, this.GuildConfigs, this.initGuildConfigIfUndefined)
}

/**
 * ギルドの設定を保存する
 * @param {string} guildId - ギルドID
 */
ttsData.prototype.saveConfig = function(guildId){
    const path = envGuildConfigsDir + "/" + String(guildId) + ".json";
    return this.saveData(guildId, path, this.GuildConfigs);
}

/**
 * ギルドの辞書を復元する
 * @param {string} guildId - ギルドID
 */
ttsData.prototype.restoreDictionary = function(guildId){
    const path = envGuildDictionariesDir + "/" + String(guildId) + ".json";
    return this.restoreData(guildId, path, this.GuildDictionaries, this.initGuildDictionaryIfUndefined)
}

/**
 * ギルドの辞書を保存する
 * @param {string} guildId - ギルドID
 */
ttsData.prototype.saveDictionary = function(guildId){
    const path = envGuildDictionariesDir + "/" + String(guildId) + ".json";
    return this.saveData(guildId, path, this.GuildDictionaries);
}

/**
 * ギルドのデータを削除する
 * @param {string} guildId - ギルドID
 */
ttsData.prototype.deleteGuildData = function(guildId){           
    delete this.GuildConfigs[guildId];
    delete this.GuildDictionaries[guildId];
    delete this.GuildQueues[guildId];
    
    return;
}

// ttsDataの宣言が重複しないように1回だけエクスポート
const ttsDataInstance = new ttsData();
export { ttsDataInstance as ttsData };