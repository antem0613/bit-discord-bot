import express from 'express';
import { spawn } from 'child_process';
import dotenv from 'dotenv';

dotenv.config();

const app = express();

const targetConfig = {
    PORT: parseInt(process.env.MONITOR_PORT || "3001"),
    TARGET: {
        URL: "http://localhost:3000/health",
        INTERVAL: parseInt(process.env.MONITOR_INTERVAL || "600000"),
        TIMEOUT: parseInt(process.env.MONITOR_TIMEOUT || "5000")
    },
    ON_FAILURE_CMD: "node main.js"
}

let healthStatus = {
    status: "STARTING",
    lastCheckAt:null,
    targetUrl: targetConfig.TARGET.URL,
    error: null
}

const performHealthCheck = async () => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), targetConfig.TARGET.TIMEOUT);

    try {
        const response = await fetch(targetConfig.TARGET.URL, { signal: controller.signal });
        if (response.ok) {
            healthStatus.status = "HEALTHY";
            healthStatus.lastCheckAt = new Date();
            healthStatus.error = null;
            console.log(`Health check successful at ${healthStatus.lastCheckAt.toISOString()}`);
        } else {
            throw new Error(`Status code: ${response.status}`);
        }
    } catch (err) {
        healthStatus.status = "UNHEALTHY";
        healthStatus.lastCheckAt = new Date();
        healthStatus.error = err.name === 'AbortError' ? 'Timed out' : err.message;
        console.error(`Health check failed at ${healthStatus.lastCheckAt.toISOString()}: ${healthStatus.error}`);
        runFailureCommand();
    }
    finally {
        clearTimeout(timeoutId);
    }
}

const runFailureCommand = () => {
    console.log(`Executing failure command: ${targetConfig.ON_FAILURE_CMD}`);
    const [command, ...args] = targetConfig.ON_FAILURE_CMD.split(' ');
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

        console.log(`Failure command output: ${stdout}`);
    });
}

app.get('/health', (req, res) => {
    const httpStatus = healthStatus.status === "HEALTHY" ? 200 : 503;
    res.status(httpStatus).json(healthStatus);
});

app.post('/check', async (req, res) => {
    await performHealthCheck();
    res.json({message: 'Health check performed', healthStatus});
});

app.listen(targetConfig.PORT, () => {
    console.log(`Monitor server is running on port ${targetConfig.PORT}`);
    performHealthCheck();
    setInterval(async () => {
        await performHealthCheck();
        if(healthStatus.status === "UNHEALTHY"){
            runFailureCommand();
        }
    }, targetConfig.TARGET.INTERVAL);
});
