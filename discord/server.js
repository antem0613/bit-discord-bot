import express from 'express';
import { spawn } from 'child_process';
import dotenv from 'dotenv';
import { TIMEOUT } from 'dns';
import { clear } from 'console';

dotenv.config();

const app = express();

const CONFIG = {
    PORT: parseInt(process.env.MONITOR_PORT || "3001"),
    TARGETS: [{
        NAME: "Discord Bot",
        URL: "http://localhost:3000/health",
        ON_FAILURE_CMD: "node main.js"
    },
    {
        NAME: "Voicevox Engine",
        URL: "http://localhost:50021/version",
        ON_FAILURE_CMD: "/home/antem/voicevox_engine-linux-cpu/linux-cpu-x64/run"
    }],
    INTERVAL: parseInt(process.env.MONITOR_INTERVAL || "600000"),
    TIMEOUT: parseInt(process.env.MONITOR_TIMEOUT || "5000")
}

let healthStatus = {
    status: "STARTING",
    lastCheckAt:null,
    error: null
}

const performHealthCheck = async () => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), CONFIG.TIMEOUT);

    for(let i = 0; i < CONFIG.TARGETS.length; i++){
        try {
            const response = await fetch(CONFIG.TARGETS[i].URL, { signal: controller.signal });
            if (response.ok) {
                continue;
            } else {
                throw new Error(`Status code: ${response.status}`);
            }
        } catch (err) {
            healthStatus.status = "UNHEALTHY";
            healthStatus.lastCheckAt = new Date();
            healthStatus.error = err.name === 'AbortError' ? 'Timed out' : err.message;
            console.error(`Health check for ${CONFIG.TARGETS[i].NAME} failed at ${healthStatus.lastCheckAt.toISOString()}: ${healthStatus.error}`);
            runFailureCommand(i);
        }
    }

    healthStatus.status = "HEALTHY";
    healthStatus.lastCheckAt = new Date();
    healthStatus.error = null;
    clearTimeout(timeoutId);
}

const runFailureCommand = (serviceIndex) => {
    if(serviceIndex === undefined || serviceIndex < 0 || serviceIndex >= CONFIG.TARGETS.length) {
        console.error('No service index provided for failure command');
        return;
    }
   
    console.log(`Executing failure command: ${CONFIG.TARGETS[serviceIndex].ON_FAILURE_CMD}`);
    const [command, ...args] = CONFIG.TARGETS[serviceIndex].ON_FAILURE_CMD.split(' ');
    const child = spawn(command, args, { stdio: 'inherit' });

    child.on('error', (error) => {
        console.error(`Error executing failure command: ${error.message}`);
    });

    child.on('exit', (code, signal) => {
        if (code !== null) {
            console.log(`Failure command exited with code ${code}`);
        } else {
            console.log(`Failure command was terminated by signal ${signal}`);
        }
    });
}

const initServer = async () => {
    console.log("Starting server...");
 
    try{
        const response = await fetch(CONFIG.TARGETS[1].URL);

        if(response.ok){
            console.log("Voicevox Engine is already running.");
        }
        else{
            throw new Error(`Voicevox Engine health check failed with status: ${response.status}`);
        }
    } catch (error) {
        console.error("Voicevox Engine is not running. Attempting to start it...");
        runFailureCommand(1);
    }

    await new Promise(resolve => setTimeout(resolve, 5000));

    try{
        const response = await fetch(CONFIG.TARGETS[0].URL);
        
        if(response.ok){
            console.log("Discord Bot is already running.");
        }
        else{
            throw new Error(`Discord Bot health check failed with status: ${response.status}`);
        }
    } catch (error) {
        console.error("Discord Bot is not running. Attempting to start it...", error);
        runFailureCommand(0);
    }
}

app.get('/health', (req, res) => {
    const httpStatus = healthStatus.status === "HEALTHY" ? 200 : 503;
    res.status(httpStatus).json(healthStatus);
});

app.post('/check', async (req, res) => {
    await performHealthCheck();
    res.json({message: 'Health check performed', healthStatus});
});

app.listen(CONFIG.PORT, () => {
    console.log(`Monitor server is running on port ${CONFIG.PORT}`);
    initServer();
    setInterval(async () => {
        await performHealthCheck();
        if(healthStatus.status === "UNHEALTHY"){
            runFailureCommand();
        }
    }, CONFIG.INTERVAL);
});