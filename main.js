import { Client , Collection , Events , GatewayIntentBits , ActivityType , EmbedBuilder} from 'discord.js';
import express from 'express';
import fs from 'fs';
import CommandResister from "./regist-command.js";
import {loadData, checkExist, createData } from './editData.js';
import dotenv from 'dotenv';
dotenv.config();

let postCount = 0;
const app = express();
app.listen(3000);

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

const client = new Client({ intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates,
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
    await handlers.get('interactionCreate').default(interaction);
});

client.on("messageCreate", async message => {
    if(message.author.id === client.user.id) return;
    await handlers.get('messageCreate').default(message);
});

client.on('ready', () => {
    console.log('Bot logged in');
    client.user.setActivity(`DiceSystem：${global.system}`, { type: ActivityType.Custom });
});

export function updateActivity(){
    client.user.setActivity(`DiceSystem：${global.system}`, { type: ActivityType.Custom });
}

CommandResister();
client.login(process.env.TOKEN);