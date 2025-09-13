import fs from 'fs';

export function saveData(){
    var data = {
        system : global.system,
        diceChannel : global.diceChannel
    }

    let masterData = JSON.stringify(data);
    fs.writeFileSync('./data.json',masterData);
}

export function loadData(){
    const json = fs.readFileSync('./data.json', 'utf8');
    var data = JSON.parse(json);
    console.log(data);
    global.system = data.system;
    global.diceChannel = data.diceChannel;
}

export function checkExist(){
    return fs.existsSync('./data.json');
}

export function createData(){
    var data = {
        system : "DiceBot",
        diceChannel : null,
    };

    let masterData = JSON.stringify(data);
    fs.writeFileSync('./data.json',masterData);

    global.system = "DiceBot";
    global.diceChannel = null;
}