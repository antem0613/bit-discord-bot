import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ApplicationCommandType, ChannelType, PermissionFlagsBits } from 'discord.js';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'say-test-'));
process.env.SAY_STORE_PATH = path.join(tmp, 'say_messages.json');

const say = await import('./say.js');
const cmd = await import('../commands/say.js');
const sayEdit = await import('../commands/sayEdit.js');
const sayDelete = await import('../commands/sayDelete.js');
const route = (await import('../handlers/interactionCreate.js')).default;

// ---------- fixtures ----------
const ALL = Object.values(PermissionFlagsBits);
function perms(allowed) {
    return { has: (wanted) => [].concat(wanted).every((p) => allowed.includes(p)) };
}
function makeWorld({ botPerms = ALL, userPerms = ALL, type = ChannelType.GuildText } = {}) {
    const bot = { id: 'bot' };
    const member = { id: 'u1' };
    const messages = new Map();
    let nextId = 100;
    const sent = [];
    const channel = {
        id: '111',
        name: 'general',
        type,
        permissionsFor: (who) => perms(who === bot ? botPerms : userPerms),
        send: async (payload) => {
            sent.push(payload);
            const msg = makeMessage(String(nextId++), payload.content ?? '', bot.id);
            messages.set(msg.id, msg);
            return msg;
        },
        messages: { fetch: async (id) => { const m = messages.get(id); if (!m) throw new Error('Unknown Message'); return m; } },
    };
    function makeMessage(id, content, authorId) {
        return {
            id, content, channelId: channel.id, channel, author: { id: authorId }, attachments: { size: 0 },
            url: say.messageUrl('222', channel.id, id),
            edits: [], deleted: false,
            async edit(p) { this.edits.push(p); this.content = p.content; return this; },
            async delete() { this.deleted = true; messages.delete(id); },
        };
    }
    const client = { user: bot, channels: { fetch: async (id) => (id === channel.id ? channel : null) } };
    return { bot, member, channel, client, sent, messages, makeMessage };
}
function baseInteraction(world, extra = {}) {
    const calls = { replies: [], modals: [], edits: [], updates: [], deferred: false };
    return {
        calls,
        user: { id: 'u1', tag: 'tester#0001' },
        member: world.member,
        guildId: '222',
        guild: { members: { me: world.bot } },
        client: world.client,
        channel: world.channel,
        reply: async (p) => calls.replies.push(p),
        showModal: async (m) => calls.modals.push(m.toJSON()),
        deferReply: async () => { calls.deferred = true; },
        editReply: async (p) => calls.edits.push(typeof p === 'string' ? { content: p } : p),
        update: async (p) => calls.updates.push(p),
        ...extra,
    };
}
function slash(world, { channel = world.channel, file = null } = {}) {
    return baseInteraction(world, { options: { getChannel: () => channel, getAttachment: () => file } });
}
function modalSubmit(world, customId, fields, userId = 'u1') {
    return baseInteraction(world, { customId, user: { id: userId, tag: 'x#1' }, fields: { getTextInputValue: (n) => fields[n] ?? '' } });
}

// ---------- pure helpers ----------
test('parseMessageLink accepts discord message links only', () => {
    assert.deepEqual(say.parseMessageLink('https://discord.com/channels/1/2/3'), { guildId: '1', channelId: '2', messageId: '3' });
    assert.ok(say.parseMessageLink('https://ptb.discord.com/channels/1/2/3'));
    assert.ok(say.parseMessageLink('https://discordapp.com/channels/1/2/3/'));
    assert.equal(say.parseMessageLink('https://evil.example/channels/1/2/3'), null);
    assert.equal(say.parseMessageLink('https://discord.com/channels/1/2'), null);
});

test('checkPostable covers bot/user permissions, threads, files and channel types', () => {
    const w = makeWorld();
    assert.equal(say.checkPostable(w.channel, w.bot, w.member), null);
    assert.match(say.checkPostable({ ...w.channel, type: ChannelType.GuildVoice }, w.bot, w.member), /テキストチャンネル/);
    const noBot = makeWorld({ botPerms: [PermissionFlagsBits.ViewChannel] });
    assert.match(say.checkPostable(noBot.channel, noBot.bot, noBot.member), /Botに/);
    const noUser = makeWorld({ userPerms: [PermissionFlagsBits.ViewChannel] });
    assert.match(say.checkPostable(noUser.channel, noUser.bot, noUser.member), /あなたに/);
    const noFiles = makeWorld({ botPerms: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] });
    assert.equal(say.checkPostable(noFiles.channel, noFiles.bot, noFiles.member), null);
    assert.match(say.checkPostable(noFiles.channel, noFiles.bot, noFiles.member, { withFile: true }), /ファイル添付/);
    const thread = makeWorld({ type: ChannelType.PublicThread, botPerms: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessagesInThreads] });
    assert.equal(say.checkPostable(thread.channel, thread.bot, thread.member), null);
});

test('command definitions: admin-only by default, guild-only, message menus', () => {
    const s = cmd.data.toJSON();
    assert.equal(s.default_member_permissions, String(PermissionFlagsBits.ManageGuild));
    assert.deepEqual(s.contexts, [0]);
    for (const m of [sayEdit.data.toJSON(), sayDelete.data.toJSON()]) {
        assert.equal(m.type, ApplicationCommandType.Message);
        assert.equal(m.default_member_permissions, String(PermissionFlagsBits.ManageGuild));
    }
});

// ---------- /say flow ----------
test('post: modal -> sends multiline text without mentions, records it, confirms with link', async () => {
    say.resetSayStoreForTest();
    const w = makeWorld();
    const i = slash(w);
    await cmd.execute(i);
    assert.equal(i.calls.modals.length, 1);
    const customId = i.calls.modals[0].custom_id;
    assert.match(customId, /^say:post:/);

    const s = modalSubmit(w, customId, { content: '一行目\n二行目 @everyone', replyTo: '' });
    await cmd.handleModalSubmit(s);
    assert.deepEqual(w.sent, [{ allowedMentions: { parse: [], repliedUser: false }, content: '一行目\n二行目 @everyone' }]);
    assert.match(s.calls.edits[0].content, /^送信しました: https:\/\/discord\.com\/channels\/222\/111\/100$/);
    assert.equal(say.isSaidMessage('100'), true);
});

test('post: attachment allows empty text and is sent as a file', async () => {
    const w = makeWorld();
    const i = slash(w, { file: { url: 'https://cdn.example/a.png', name: 'a.png' } });
    await cmd.execute(i);
    const s = modalSubmit(w, i.calls.modals[0].custom_id, { content: '', replyTo: '' });
    await cmd.handleModalSubmit(s);
    assert.deepEqual(w.sent[0].files, [{ attachment: 'https://cdn.example/a.png', name: 'a.png' }]);
    assert.equal(w.sent[0].content, undefined);
});

test('post: refused up front when the user cannot post in the target channel', async () => {
    const w = makeWorld({ userPerms: [PermissionFlagsBits.ViewChannel] });
    const i = slash(w);
    await cmd.execute(i);
    assert.equal(i.calls.modals.length, 0);
    assert.match(i.calls.replies[0].content, /あなたに/);
});

test('sessions are single-use and bound to the user who opened the form', async () => {
    const w = makeWorld();
    const i = slash(w);
    await cmd.execute(i);
    const id = i.calls.modals[0].custom_id;
    const other = modalSubmit(w, id, { content: 'hi', replyTo: '' }, 'intruder');
    await cmd.handleModalSubmit(other);
    assert.match(other.calls.replies[0].content, /有効期限/);
    assert.equal(w.sent.length, 0);
    // an intruder's attempt doesn't consume the owner's form: the owner can still submit once...
    await cmd.handleModalSubmit(modalSubmit(w, id, { content: 'hi', replyTo: '' }));
    assert.equal(w.sent.length, 1);
    // ...but not twice
    const again = modalSubmit(w, id, { content: 'hi', replyTo: '' });
    await cmd.handleModalSubmit(again);
    assert.match(again.calls.replies[0].content, /有効期限/);
    assert.equal(w.sent.length, 1);
    // forged key
    const forged = modalSubmit(w, 'say:post:doesnotexist', { content: 'hi', replyTo: '' });
    await cmd.handleModalSubmit(forged);
    assert.equal(w.sent.length, 1);
});

test('reply link: must be in the target channel and exist', async () => {
    const w = makeWorld();
    const existing = w.makeMessage('55', 'original', 'someone');
    w.messages.set('55', existing);
    for (const [link, expect] of [
        ['https://discord.com/channels/222/333/55', /送信先チャンネル内/],
        ['https://discord.com/channels/222/111/999', /見つかりません/],
        ['not a link', /送信先チャンネル内/],
    ]) {
        const i = slash(w);
        await cmd.execute(i);
        const s = modalSubmit(w, i.calls.modals[0].custom_id, { content: 'x', replyTo: link });
        await cmd.handleModalSubmit(s);
        assert.match(s.calls.replies[0].content, expect);
    }
    assert.equal(w.sent.length, 0);
    const i = slash(w);
    await cmd.execute(i);
    await cmd.handleModalSubmit(modalSubmit(w, i.calls.modals[0].custom_id, { content: 'reply!', replyTo: 'https://discord.com/channels/222/111/55' }));
    assert.deepEqual(w.sent[0].reply, { messageReference: '55', failIfNotExists: false });
});

// ---------- edit / delete ----------
test('edit: only /say messages; modal is prefilled; edit keeps mentions off', async () => {
    say.resetSayStoreForTest();
    const w = makeWorld();
    const dice = w.makeMessage('7', '(2D6) > 7', 'bot'); // bot message not sent via /say
    const i1 = baseInteraction(w, { targetMessage: dice });
    await sayEdit.execute(i1);
    assert.match(i1.calls.replies[0].content, /\/say で送信した/);
    assert.equal(i1.calls.modals.length, 0);

    const post = slash(w);
    await cmd.execute(post);
    await cmd.handleModalSubmit(modalSubmit(w, post.calls.modals[0].custom_id, { content: '旧本文', replyTo: '' }));
    const msg = w.messages.get('100');
    const i2 = baseInteraction(w, { targetMessage: msg });
    await sayEdit.execute(i2);
    const modal = i2.calls.modals[0];
    assert.match(modal.custom_id, /^say:edit:/);
    assert.equal(modal.components[0].components[0].value, '旧本文');
    const s = modalSubmit(w, modal.custom_id, { content: '新本文 @here' });
    await cmd.handleModalSubmit(s);
    assert.deepEqual(msg.edits, [{ content: '新本文 @here', allowedMentions: { parse: [], repliedUser: false } }]);
    assert.match(s.calls.edits[0].content, /^編集しました/);
});

test('delete: confirmation buttons, cancel keeps it, confirm deletes and forgets', async () => {
    say.resetSayStoreForTest();
    const w = makeWorld();
    const post = slash(w);
    await cmd.execute(post);
    await cmd.handleModalSubmit(modalSubmit(w, post.calls.modals[0].custom_id, { content: '消す予定', replyTo: '' }));
    const msg = w.messages.get('100');

    const ask = baseInteraction(w, { targetMessage: msg });
    await sayDelete.execute(ask);
    const buttons = ask.calls.replies[0].components[0].toJSON().components;
    assert.deepEqual(buttons.map((b) => b.label), ['削除する', 'やめる']);

    const cancel = baseInteraction(w, { customId: buttons[1].custom_id });
    await cmd.handleButton(cancel);
    assert.equal(msg.deleted, false);
    assert.match(cancel.calls.updates[0].content, /やめました/);

    const ask2 = baseInteraction(w, { targetMessage: msg });
    await sayDelete.execute(ask2);
    const del = ask2.calls.replies[0].components[0].toJSON().components[0].custom_id;
    const intruder = baseInteraction(w, { customId: del, user: { id: 'intruder', tag: 'x' } });
    await cmd.handleButton(intruder);
    assert.equal(msg.deleted, false);
    const ok = baseInteraction(w, { customId: del });
    await cmd.handleButton(ok);
    assert.equal(msg.deleted, true);
    assert.equal(say.isSaidMessage('100'), false);
});

test('records persist across restarts (file-backed)', () => {
    say.resetSayStoreForTest();
    say.recordSaidMessage({ messageId: 'persist-1', guildId: 'g', channelId: 'c', authorId: 'u' });
    say.resetSayStoreForTest(); // simulates a restart: in-memory cache dropped
    assert.equal(say.isSaidMessage('persist-1'), true);
    assert.ok(fs.readFileSync(process.env.SAY_STORE_PATH, 'utf8').includes('persist-1'));
});

// ---------- routing ----------
test('interactionCreate routes context menus, say: modals and buttons', async () => {
    const seen = [];
    const fakeSay = { handleModalSubmit: async () => seen.push('modal'), handleButton: async () => seen.push('button') };
    const fakeEdit = { execute: async () => seen.push('context') };
    const commands = new Map([['say', fakeSay], ['Botの発言を編集', fakeEdit]]);
    const base = { client: { commands }, isAutocomplete: () => false, isChatInputCommand: () => false, isModalSubmit: () => false, isButton: () => false, isContextMenuCommand: () => false };
    await route({ ...base, commandName: 'Botの発言を編集', isContextMenuCommand: () => true }, {});
    await route({ ...base, customId: 'say:edit:k', isModalSubmit: () => true }, {});
    await route({ ...base, customId: 'say:delete:k', isButton: () => true }, {});
    assert.deepEqual(seen, ['context', 'modal', 'button']);
});

test.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
