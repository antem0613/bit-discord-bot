import { Client , Collection , Events , GatewayIntentBits , ActivityType , EmbedBuilder} from 'discord.js';
import { setupTerminalMessageSender } from './utils/terminalMessageSender.js';
import { getVoiceConnection } from "@discordjs/voice";
import express from 'express';
import fs from 'fs';
import CommandResister from "./regist-command.js";
import { editData } from './editData.js';
import { loadData, checkExist, createData } from './editData.js';
import dotenv from 'dotenv';
dotenv.config();

let postCount = 0;
const app = express();
app.listen(process.env.SERVER_PORT || 3000, () => {
    console.log(`Server is running on port ${process.env.SERVER_PORT || 3000}`);
});

if(checkExist()){
    loadData();
}
else{
    createData();
}

app.post('/',function(req,res){
    console.log('POST request received');

    postCount++;
    if(postCount == 10){
        postCount = 0;
    }
});

app.get('/health', (req, res) => {
    res.status(200).json({status: 'ok'});
});

const client = new Client({ intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessageReactions
]});

client.commands = new Collection();

const commandFiles = fs.readdirSync('./commands').filter(file => file.endsWith('.js'));

for(const file of commandFiles){
    const filePath = `./commands/${file}`;
    import(filePath).then(module => {client.commands.set(module.data.name, module);});
}

const handlers = new Map();
const handlerFiles = fs.readdirSync('./handlers').filter(file => file.endsWith('.js'));

for(const file of handlerFiles){
    const filePath = `./handlers/${file}`;
    import(filePath).then(module => {handlers.set(file.slice(0,-3), module);});
}

client.on("interactionCreate", async interaction => {
    await handlers.get('interactionCreate').default(interaction, editData);
});

client.on("messageCreate", async message => {
    if(message.author.id === client.user.id) return;
    await handlers.get('messageCreate').default(message, editData);
});



client.on('clientReady', () => {
    console.log('Bot logged in');
    // editDataからsystem名取得
    for (const guild of client.guilds.cache.values()) {
        const guildConfig = editData.initGuildConfigIfUndefined(guild.id);
        const systemName = guildConfig.dice?.system || 'DiceBot';
        client.user.setActivity(`DiceSystem：${systemName}`, { type: ActivityType.Custom });
    }
});

    // ボイスチャンネルに誰もいなくなったらBotが退出する
client.on("voiceStateUpdate", (oldState, newState) => {
    const guildId = oldState.guild.id;
    const connection = getVoiceConnection(guildId);
    if (!connection) return;

    const botChannelId = connection.joinConfig.channelId;
    const channel = oldState.guild.channels.cache.get(botChannelId);
    if (!channel || channel.type !== 2) return; // type: 2 = GUILD_VOICE

    // Bot以外のメンバーがいない場合
    const nonBotMembers = channel.members.filter(member => !member.user.bot);
    if (nonBotMembers.size === 0) {
        connection.destroy();
        console.log("[TTS] Disconnected due to no non-bot members in the voice channel.");
    }
});

export function updateActivity() {
    for (const guild of client.guilds.cache.values()) {
        const systemName = editData.GuildConfigs[guild.id]?.dice?.system || 'DiceBot';
        client.user.setActivity(`DiceSystem：${systemName}`, { type: ActivityType.Custom });
    }
}



CommandResister();
client.login(process.env.TOKEN);
// Bot起動後にターミナルからメッセージ送信できるようにする
client.once('clientReady', () => {
    setupTerminalMessageSender(client);
});

// プロセス終了時に/tts off相当の処理を実行
function disconnectAllVoice() {
    for (const [guildId, connection] of (getVoiceConnection instanceof Function ? [...client.guilds.cache.values()].map(g => [g.id, getVoiceConnection(g.id)]).filter(([_, c]) => c) : [])) {
        try {
            connection.state.subscription?.player?.stop();
            connection.destroy();
            editData.saveConfig(guildId);
            editData.saveDictionary(guildId);
            console.log(`[TTS] Disconnected from guild ${guildId}`);
        } catch (e) {
            console.error(`[TTS] Disconnect error for guild ${guildId}:`, e);
        }
    }
}
// SIGINT/SIGTERM時のみBotを安全にシャットダウン
process.on('SIGINT', () => {
    disconnectAllVoice();
    process.exit(0);
});
process.on('SIGTERM', () => {
    disconnectAllVoice();
    process.exit(0);
});
// 通常のコマンド実行エラーや例外ではBotはシャットダウンしません（致命的な場合のみプロセス終了）