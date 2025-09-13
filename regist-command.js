import fs from 'fs';
import path from 'path';
import {REST , Routes} from 'discord.js';

const commands = [];
const commandFiles = fs.readdirSync('./commands').filter(file => file.endsWith('.js'));

export default async () => {
    for(const file of commandFiles){
        const filePath = `./commands/${file}`;
            await import(filePath).then(module => {
                if (!module.data) {
                    console.error(`[ERROR] ${filePath} の data が undefined です`);
                }
                commands.push(module.data?.toJSON?.() ?? null);
            });
    }

const rest = new REST().setToken(process.env.TOKEN);

(async () => {
    try{
        console.log(`[INIT] Started refreshing ${commands.length} slash-commands.`);

        const data = await rest.put(
            Routes.applicationCommands(process.env.APPLICATION_ID),
            {body: commands});
        
        const dataGuild = await rest.put(
            Routes.applicationCommands(process.env.APPLICATION_ID),
            {body: commands});
        
        console.log(`[INIT] Successfully reloaded ${data.length} slash-commands.`);
    }
    catch(error){
        console.error(error);
    }
})();
};