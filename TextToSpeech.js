import { Readable } from 'stream';
import dotenv from 'dotenv';
import { setTimeout } from 'timers/promises';
import { entersState, AudioPlayerStatus, createAudioResource, StreamType } from '@discordjs/voice';
import ffmpeg from 'ffmpeg-static';
import { spawn } from 'child_process';

dotenv.config();

const envVoiceServerTextLengthLimit = parseInt(process.env.voiceServerTextLengthLimit || process.env.voiceServerTextLengthLimit || process.env.VOICEVOX_SERVER_TEXT_LENGTH_LIMIT || "160");

const envSamplingRate = parseInt(process.env.samplingRate || process.env.SAMPLING_RATE || "24000");
const envQueueTimeout = parseInt(process.env.queueTimeout || process.env.QUEUE_TIMEOUT || "10000");
const envQueuePollingInterval = parseInt(process.env.queuePollingInterval || process.env.QUEUE_POLLING_INTERVAL || "100");

async function TextToSpeech(splitedText, speaker, player, queue){
  console.log('[TTS] TextToSpeech called', {splitedText, speaker});
  const fullTextLength = splitedText.reduce((sum, text) => sum + text.length, 0);

  // 文字数制限を超えた場合の処理
  if(fullTextLength > envVoiceServerTextLengthLimit){
    splitedText = ["文字数が上限を超えています"];
  }

  const ticket = Symbol(); // キュー管理用の一意の識別子
  enQueue(queue, ticket);

  let count = Math.floor(envQueueTimeout / envQueuePollingInterval);

  // タイムアウトまで待機（自分の順番になるまで）
  while(queue[0] !== ticket){
    if(count === 0){
      deQueue(queue, ticket);
      return;
    }

    await setTimeout(envQueuePollingInterval);
        
    if(!queue.includes(ticket)) return; // キューから削除されていた場合は終了
    
    count--;
  }

  const waveDatas = [];

  for(const text of splitedText){
    const waveData = await voiceSynthesis(text, speaker);
    
    if(!waveData) continue;
    
    waveDatas.push(waveData);
  }

  for(const waveData of waveDatas){
    await entersState(player, AudioPlayerStatus.Idle, envQueueTimeout); // 前の音声再生が終わるまで待つ
    
    if(!queue.includes(ticket)) return;  // キューから削除された場合は終了
    
    player.play(waveData);
  }

  deQueue(queue, ticket);
  
  return;
};

async function voiceSynthesis(text, speaker){
  // speaker.engineが未定義の場合はデフォルト値を利用
  const engine = speaker.engine || process.env.DEFAULT_SPEAKER_ENGINE || "VOICEVOX";
  const servers = getVoiceServers();
  const server = servers.find( (x) => x.engine === engine );

  if(!server){
    console.error('[TTS] getVoiceServers result:', servers);
    throw new Error(`Failed to retrieve voice server information for engine '${engine}'. Please check the configuration format.`);
  }

  // 音声合成のクエリ作成
  console.log('[TTS] audio_query fetch', server.baseURL, text, speaker.id);
  const response_audio_query = await fetch(server.baseURL + "/audio_query?text=" + encodeURIComponent(text) + "&speaker=" + speaker.id, {
    "method": "POST",
    "headers":{ "accept": "application/json" }
  });

  if(!response_audio_query.ok){
    throw new Error(`audio_query API failed: ${response_audio_query.status} ${response_audio_query.statusText}`);
  }

  const audioQuery = await response_audio_query.json();
  // speakerの設定値をaudioQueryに反映
  if (typeof speaker.speedScale === 'number') audioQuery.speedScale = speaker.speedScale;
  if (typeof speaker.pitchScale === 'number') audioQuery.pitchScale = speaker.pitchScale;
  if (typeof speaker.intonationScale === 'number') audioQuery.intonationScale = speaker.intonationScale;
  if (typeof speaker.volumeScale === 'number') audioQuery.volumeScale = speaker.volumeScale;
  if (typeof speaker.tempoDynamicsScale === 'number') audioQuery.tempoDynamicsScale = speaker.tempoDynamicsScale;

  // 音声データの生成

  let response_synthesis;
  try {
    response_synthesis = await fetch(server.baseURL + "/synthesis?speaker=" + speaker.id, {
      "method": "POST",
      "headers": { "accept": "audio/wav", "Content-Type": "application/json" },
      "body": JSON.stringify(audioQuery),
      setTimeout: 60000
    });
  } catch (err) {
    console.error('Fetch error:', err);
    return;
  }

  if (!response_synthesis || !response_synthesis.ok) {
    return;
  }

  // ストリームとして音声データを扱う（Web Streams API → Node.js Stream変換）
  const webStream = response_synthesis.body;
  function webStreamToNodeStream(webStream) {
    const reader = webStream.getReader();
    return new Readable({
      async read() {
        const { done, value } = await reader.read();
        if (done) {
          this.push(null);
        } else {
          this.push(Buffer.from(value));
        }
      }
    });
  }
  const nodeStream = webStreamToNodeStream(webStream);

  // ffmpegでPCM変換
  const ffmpegProcess = spawn(ffmpeg, [
    '-i', 'pipe:0',
    '-f', 's16le',
    '-ar', '48000',
    '-ac', '2',
    'pipe:1'
  ]);

  console.log('[TTS] piping stream to ffmpeg');
  nodeStream.pipe(ffmpegProcess.stdin);

  console.log('[TTS] createAudioResource called');
  const waveData = createAudioResource(ffmpegProcess.stdout, { inputType: StreamType.Raw });
  return waveData;
}

function enQueue(queue, ticket){
  if(!queue || !ticket) return;
  
  queue.push(ticket);
  
  return;
}

function deQueue(queue, ticket){
  if(!queue || !ticket) return;
  
  if(!queue.includes(ticket)) return; // チケットが含まれていない場合、処理をしない。

  const index = queue.indexOf(ticket);
  queue.splice(0, index + 1);// 自分より前のチケットも削除
    
  return;
}

function getVoiceServers(){
  const servers = [];

  const urlStr = process.env.VOICEVOX_SERVER_URL;
  if (!urlStr) {
    console.error('[TTS] VOICEVOX_SERVER_URL is not set');
    return [];
  }
  let url;
  try {
    url = new URL(urlStr);
  } catch (e) {
    console.error('[TTS] VOICEVOX_SERVER_URL is invalid:', urlStr);
    return [];
  }
    // URLフラグメントをエンジン識別子として扱う(#の部分は取り除く)
  let engine = url.hash ? url.hash.replace(/^#/, "") : "";

  if (!engine) {
      // フラグメントが空の場合はデフォルト値を利用
    engine = process.env.DEFAULT_SPEAKER_ENGINE || "VOICEVOX";
  }

  const baseURL = url.origin;
  servers.push({ "engine": engine, "baseURL": baseURL });
  return servers;
}

export { TextToSpeech };