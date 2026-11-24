// Speech pipeline: per-guild job queue -> VOICEVOX synthesis -> playback on the guild's AudioPlayer.
//
// Design notes (each addresses a past crash / stall):
// - No external ffmpeg process: VOICEVOX is asked for 48 kHz stereo 16-bit WAV, which is exactly the raw
//   PCM Discord voice wants, so the WAV header is stripped and the samples are played directly. Nothing
//   is spawned or piped, so there are no stray processes or EPIPE errors when playback is cut short.
//   (If an engine ignores the output settings, the WAV is handed to @discordjs/voice as "arbitrary" input
//   instead and the library manages the conversion itself.)
// - Only one sentence is synthesized ahead of the one playing, so memory stays flat for long messages and
//   at most one prepared clip is thrown away when a job is cancelled.
// - Waiting for a clip to finish uses the clip's real duration (+ margin) instead of a fixed 10 s, so long
//   sentences no longer time out and abort the job.
// - Every network call has a timeout; the queue has a size cap; /tts off or a disconnect cancels the
//   queue. Nothing in here throws to the caller: failures are logged and the item is skipped.
import { Readable } from 'stream';
import dotenv from 'dotenv';
import { entersState, AudioPlayerStatus, createAudioResource, StreamType } from '@discordjs/voice';

dotenv.config();

const envInt = (value, fallback) => {
  const n = parseInt(value, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

const TEXT_LENGTH_LIMIT = envInt(
  process.env.voiceServerTextLengthLimit || process.env.VOICE_SERVER_TEXT_LENGTH_LIMIT || process.env.VOICEVOX_SERVER_TEXT_LENGTH_LIMIT,
  160
);
const REQUEST_TIMEOUT_MS = envInt(process.env.TTS_REQUEST_TIMEOUT_MS, 30000);
const MAX_QUEUE_LENGTH = envInt(process.env.TTS_MAX_QUEUE_LENGTH, 20);
const START_TIMEOUT_MS = 5000; // time allowed for the player to start playing a clip
const END_MARGIN_MS = 5000; // extra wait on top of the clip's duration
const MAX_CLIP_WAIT_MS = 5 * 60 * 1000;

const OUTPUT_SAMPLE_RATE = 48000; // Discord voice: 48 kHz, stereo, signed 16-bit little-endian
const OUTPUT_CHANNELS = 2;
const BYTES_PER_SECOND = OUTPUT_SAMPLE_RATE * OUTPUT_CHANNELS * 2;

export const TOO_LONG_MESSAGE = "文字数が上限を超えています";

// ---------------------------------------------------------------------------------------------------
// WAV parsing

// Parses a RIFF/WAVE buffer. Returns null if it isn't one. Walks the chunks, so extra chunks
// (LIST, etc.) before "data" are handled.
export function parseWav(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 12) return null;
  if (buffer.toString('ascii', 0, 4) !== 'RIFF' || buffer.toString('ascii', 8, 12) !== 'WAVE') return null;

  let format = null;
  let offset = 12;
  while (offset + 8 <= buffer.length) {
    const id = buffer.toString('ascii', offset, offset + 4);
    const size = buffer.readUInt32LE(offset + 4);
    const body = offset + 8;
    if (id === 'fmt ' && body + 16 <= buffer.length) {
      format = {
        audioFormat: buffer.readUInt16LE(body),
        channels: buffer.readUInt16LE(body + 2),
        sampleRate: buffer.readUInt32LE(body + 4),
        bitsPerSample: buffer.readUInt16LE(body + 14),
      };
    } else if (id === 'data') {
      if (!format) return null;
      const end = Math.min(body + size, buffer.length); // tolerate a truncated/streamed size field
      return { ...format, data: buffer.subarray(body, end) };
    }
    offset = body + size + (size % 2); // chunks are word-aligned
  }
  return null;
}

// ---------------------------------------------------------------------------------------------------
// Synthesis

function getVoiceServer(engine) {
  const urlStr = process.env.VOICEVOX_SERVER_URL;
  if (!urlStr) {
    console.error('[TTS] VOICEVOX_SERVER_URL is not set');
    return null;
  }
  let url;
  try {
    url = new URL(urlStr);
  } catch {
    console.error('[TTS] VOICEVOX_SERVER_URL is invalid:', urlStr);
    return null;
  }
  // The URL fragment names the engine (e.g. http://host:50021#VOICEVOX); default otherwise.
  const serverEngine = url.hash.replace(/^#/, '') || process.env.DEFAULT_SPEAKER_ENGINE || 'VOICEVOX';
  return serverEngine === engine ? { engine: serverEngine, baseURL: url.origin } : null;
}

// Turns one sentence into a playable clip { pcm, durationMs, inputType }. Throws on failure (callers use
// `safeSynthesize`).
export async function synthesize(text, speaker) {
  const engine = speaker.engine || process.env.DEFAULT_SPEAKER_ENGINE || 'VOICEVOX';
  const server = getVoiceServer(engine);
  if (!server) throw new Error(`No voice server configured for engine '${engine}'`);

  const queryRes = await fetch(`${server.baseURL}/audio_query?text=${encodeURIComponent(text)}&speaker=${speaker.id}`, {
    method: 'POST',
    headers: { accept: 'application/json' },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!queryRes.ok) throw new Error(`audio_query failed: ${queryRes.status} ${queryRes.statusText}`);
  const audioQuery = await queryRes.json();

  for (const key of ['speedScale', 'pitchScale', 'intonationScale', 'volumeScale', 'tempoDynamicsScale']) {
    if (typeof speaker[key] === 'number') audioQuery[key] = speaker[key];
  }
  audioQuery.outputSamplingRate = OUTPUT_SAMPLE_RATE;
  audioQuery.outputStereo = true;

  const synthRes = await fetch(`${server.baseURL}/synthesis?speaker=${speaker.id}`, {
    method: 'POST',
    headers: { accept: 'audio/wav', 'Content-Type': 'application/json' },
    body: JSON.stringify(audioQuery),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!synthRes.ok) throw new Error(`synthesis failed: ${synthRes.status} ${synthRes.statusText}`);
  const wavBuffer = Buffer.from(await synthRes.arrayBuffer());

  return clipFromWav(wavBuffer);
}

// Exported for tests.
export function clipFromWav(wavBuffer) {
  const wav = parseWav(wavBuffer);
  if (!wav) throw new Error('synthesis returned data that is not a WAV file');

  const isDiscordPcm =
    wav.audioFormat === 1 && wav.bitsPerSample === 16 && wav.sampleRate === OUTPUT_SAMPLE_RATE && wav.channels === OUTPUT_CHANNELS;
  if (isDiscordPcm) {
    return { pcm: wav.data, durationMs: (wav.data.length / BYTES_PER_SECOND) * 1000, inputType: StreamType.Raw };
  }
  // Engine ignored the requested output format: let @discordjs/voice transcode the WAV itself.
  const bytesPerSecond = wav.sampleRate * wav.channels * (wav.bitsPerSample / 8);
  const durationMs = bytesPerSecond > 0 ? (wav.data.length / bytesPerSecond) * 1000 : 30000;
  return { pcm: wavBuffer, durationMs, inputType: StreamType.Arbitrary };
}

// Replaced in tests to avoid a real VOICEVOX server.
let synthesizer = synthesize;
export function setSynthesizerForTest(fn) {
  synthesizer = fn ?? synthesize;
}

// Never rejects: a failed sentence is logged and skipped.
async function safeSynthesize(text, speaker) {
  try {
    return await synthesizer(text, speaker);
  } catch (error) {
    console.error(`[TTS] synthesis failed (${error?.name === 'TimeoutError' ? 'timeout' : error?.message ?? error}):`, text);
    return null;
  }
}

// ---------------------------------------------------------------------------------------------------
// Playback

// Plays one clip and resolves when it has finished (or was given up on). Never rejects.
export async function playClip(player, clip) {
  try {
    const resource = createAudioResource(Readable.from([clip.pcm]), { inputType: clip.inputType });
    player.play(resource);
    await entersState(player, AudioPlayerStatus.Playing, START_TIMEOUT_MS);
    const waitMs = Math.min(Math.ceil(clip.durationMs) + END_MARGIN_MS, MAX_CLIP_WAIT_MS);
    await entersState(player, AudioPlayerStatus.Idle, waitMs);
  } catch (error) {
    // Didn't start (e.g. no subscriber) or didn't end in time: stop so the next clip can play.
    console.error('[TTS] playback did not complete; stopping clip:', error?.message ?? error);
    try {
      player.stop(true);
    } catch {
      // player already gone
    }
  }
}

// ---------------------------------------------------------------------------------------------------
// Message length

// Reading a very long paste for minutes blocks everyone else, so only the beginning is read.
const MAX_MESSAGE_LENGTH = (() => {
  const n = parseInt(process.env.TTS_MAX_MESSAGE_LENGTH, 10);
  return Number.isFinite(n) && n > 0 ? n : 400;
})();
const TRUNCATED_SUFFIX = "、以下省略";

export function limitSentences(sentences, maxLength = MAX_MESSAGE_LENGTH) {
  const out = [];
  let total = 0;
  for (const sentence of sentences) {
    if (total + sentence.length > maxLength) {
      const room = maxLength - total;
      if (room > 0) out.push(sentence.slice(0, room));
      if (out.length > 0) out[out.length - 1] += TRUNCATED_SUFFIX;
      else out.push("以下省略");
      return out;
    }
    out.push(sentence);
    total += sentence.length;
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------
// Per-guild queue

const guildQueues = new Map(); // guildId -> { jobs: [], running: boolean, generation: number }

function getQueue(guildId) {
  let q = guildQueues.get(guildId);
  if (!q) {
    q = { jobs: [], running: false, generation: 0 };
    guildQueues.set(guildId, q);
  }
  return q;
}

/**
 * Adds a job ({ text: string[], speakerConfig, player }) and starts the guild's runner if idle.
 * When more than MAX_QUEUE_LENGTH jobs are waiting, the oldest are dropped (stale chat isn't worth
 * reading minutes late).
 */
export function enqueueTTSJob(guildId, job) {
  const q = getQueue(guildId);
  q.jobs.push(job);
  if (q.jobs.length > MAX_QUEUE_LENGTH) {
    const dropped = q.jobs.splice(0, q.jobs.length - MAX_QUEUE_LENGTH);
    console.warn(`[TTS] queue full for guild ${guildId}; dropped ${dropped.length} oldest job(s)`);
  }
  if (!q.running) {
    q.running = true;
    void runQueue(guildId, q);
  }
}

// Cancels everything for a guild: pending jobs are dropped and the job in progress stops after its
// current clip (playback itself is stopped by the caller via player.stop()).
export function clearTTSQueue(guildId) {
  const q = guildQueues.get(guildId);
  if (!q) return;
  q.jobs.length = 0;
  q.generation++;
}

// Exported for tests/diagnostics.
export function getQueueStats(guildId) {
  const q = guildQueues.get(guildId);
  return q ? { pending: q.jobs.length, running: q.running } : { pending: 0, running: false };
}

async function runQueue(guildId, q) {
  try {
    for (;;) {
      const job = q.jobs.shift();
      if (!job) break; // checked synchronously right before `running` is cleared below
      try {
        await speakJob(job, q, q.generation);
      } catch (error) {
        console.error(`[TTS] job failed for guild ${guildId}:`, error);
      }
    }
  } finally {
    q.running = false;
  }
}

async function speakJob(job, q, generation) {
  const texts = (job.text ?? [])
    .map((t) => String(t))
    .filter((t) => t.trim() !== '')
    .map((t) => (t.length > TEXT_LENGTH_LIMIT ? TOO_LONG_MESSAGE : t));
  if (texts.length === 0) return;

  // Synthesize sentence i+1 while sentence i plays.
  let next = safeSynthesize(texts[0], job.speakerConfig);
  for (let i = 0; i < texts.length; i++) {
    const clip = await next;
    next = i + 1 < texts.length ? safeSynthesize(texts[i + 1], job.speakerConfig) : null;
    if (q.generation !== generation) return; // cancelled (/tts off, disconnect)
    if (!clip) continue;
    await playClip(job.player, clip);
  }
}
