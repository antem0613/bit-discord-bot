import { rollDice } from "../commands/dice.js";
import { MessageFlags } from "discord.js"

export default async(message) => {
  console.log(message.channel.id + "," + global.diceChannel + "," + global.llmChannel);

  if(global.diceChannel == null || message.channel.id == global.diceChannel){
    try{
      var res = await rollDice(message);
  
      if(res != null){
        if(res.startsWith("s")){
          message.channel.send("||" + res + "||");
        }
        else{
          message.channel.send(res);
        }
      }
    }
    catch(e){
      message.channel.send("エラーが発生しました。");
    }
  }
};