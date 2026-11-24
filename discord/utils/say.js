// Helpers for posting as the bot from Discord (/say and the "Botの発言を編集/削除" message menus).
// Kept free of client state so they can be unit-tested.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { ChannelType, PermissionFlagsBits } from 'discord.js';

export const MAX_CONTENT_LENGTH = 2000;

// Channel types the bot can post into.
export const POSTABLE_CHANNEL_TYPES = [
    ChannelType.GuildText,
    ChannelType.GuildAnnouncement,
    ChannelType.PublicThread,
    ChannelType.PrivateThread,
    ChannelType.AnnouncementThread,
];

const isThread = (channel) => [ChannelType.PublicThread, ChannelType.PrivateThread, ChannelType.AnnouncementThread].includes(channel?.type);

// Permissions needed to post (threads use SendMessagesInThreads instead of SendMessages).
export function requiredPostPermissions(channel, { withFile = false } = {}) {
    const perms = [PermissionFlagsBits.ViewChannel, isThread(channel) ? PermissionFlagsBits.SendMessagesInThreads : PermissionFlagsBits.SendMessages];
    if (withFile) perms.push(PermissionFlagsBits.AttachFiles);
    return perms;
}

/**
 * Returns null if both the bot and the invoking member may post in `channel`, otherwise a Japanese
 * reason. The member check keeps /say from being used to reach channels the user can't post in.
 */
export function checkPostable(channel, botMember, member, { withFile = false } = {}) {
    if (!channel || !POSTABLE_CHANNEL_TYPES.includes(channel.type)) return 'テキストチャンネルかスレッドを指定してください。';
    const perms = requiredPostPermissions(channel, { withFile });
    if (!channel.permissionsFor(botMember)?.has(perms)) {
        return withFile ? 'Botにそのチャンネルでの送信・ファイル添付の権限がありません。' : 'Botにそのチャンネルでの送信権限がありません。';
    }
    if (member && !channel.permissionsFor(member)?.has(perms)) return 'あなたにそのチャンネルでの送信権限がありません。';
    return null;
}

// "https://discord.com/channels/<guild>/<channel>/<message>" (also ptb./canary., discordapp.com).
export function parseMessageLink(text) {
    const m = String(text ?? '').trim().match(/^https?:\/\/(?:(?:ptb|canary)\.)?discord(?:app)?\.com\/channels\/(\d+)\/(\d+)\/(\d+)\/?$/);
    return m ? { guildId: m[1], channelId: m[2], messageId: m[3] } : null;
}

export function messageUrl(guildId, channelId, messageId) {
    return `https://discord.com/channels/${guildId}/${channelId}/${messageId}`;
}

// Never ping anyone: posts behave like the bot quietly writing text.
export const NO_MENTIONS = Object.freeze({ parse: [], repliedUser: false });

// ---------------------------------------------------------------------------------------------------
// Short-lived server-side sessions between a command and its modal/button. Component custom IDs only
// carry an opaque key; who may complete the flow and where it posts are kept here.

const SESSION_TTL_MS = 15 * 60 * 1000;
const sessions = new Map(); // key -> { userId, expiresAt, ...data }

export function createSession(userId, data, now = Date.now()) {
    for (const [key, s] of sessions) if (s.expiresAt <= now) sessions.delete(key);
    const key = crypto.randomBytes(9).toString('base64url');
    sessions.set(key, { ...data, userId, expiresAt: now + SESSION_TTL_MS });
    return key;
}

// Returns and removes the session if it exists, hasn't expired and belongs to `userId`.
export function takeSession(key, userId, now = Date.now()) {
    const s = sessions.get(key);
    if (!s || s.userId !== userId) return null;
    sessions.delete(key);
    return s.expiresAt > now ? s : null;
}

// ---------------------------------------------------------------------------------------------------
// Record of messages posted via /say, so only those (not dice results etc.) can be edited/deleted.
// Persisted as JSON under data/ (a mounted volume in Docker) and capped.

const MAX_RECORDS = 2000;

function storePath() {
    return process.env.SAY_STORE_PATH || path.join(process.cwd(), 'data', 'say_messages.json');
}

let records = null; // Map messageId -> { guildId, channelId, authorId, at }

function load() {
    if (records) return records;
    records = new Map();
    try {
        const raw = JSON.parse(fs.readFileSync(storePath(), 'utf8'));
        for (const r of raw) if (r?.messageId) records.set(r.messageId, r);
    } catch (error) {
        if (error.code !== 'ENOENT') console.error('[say] failed to read message records:', error.message);
    }
    return records;
}

function save() {
    try {
        fs.mkdirSync(path.dirname(storePath()), { recursive: true });
        fs.writeFileSync(storePath(), JSON.stringify([...records.values()]));
    } catch (error) {
        console.error('[say] failed to save message records:', error.message);
    }
}

export function recordSaidMessage({ messageId, guildId, channelId, authorId }, now = Date.now()) {
    load();
    records.set(messageId, { messageId, guildId, channelId, authorId, at: now });
    while (records.size > MAX_RECORDS) records.delete(records.keys().next().value);
    save();
}

export function isSaidMessage(messageId) {
    return load().has(messageId);
}

export function forgetSaidMessage(messageId) {
    if (load().delete(messageId)) save();
}

// For tests: drop the in-memory cache so the next call re-reads the file.
export function resetSayStoreForTest() {
    records = null;
    sessions.clear();
}
