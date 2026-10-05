import test from 'node:test';
import assert from 'node:assert/strict';
import { PassThrough } from 'node:stream';
import { ChannelType } from 'discord.js';
import { getSendableChannels, sendTerminalMessage, setupTerminalMessageSender } from './terminalMessageSender.js';

function fixture() {
    const sent = [];
    const channel = { id: '123', name: 'general', guild: { name: 'Test' }, type: ChannelType.GuildText, permissionsFor: () => ({ has: () => true }), send: async payload => sent.push(payload) };
    const client = { user: { id: 'bot' }, channels: { cache: new Map([[channel.id, channel]]) } };
    return { client, channel, sent };
}

test('lists only visible writable guild text channels', () => {
    const { client, channel } = fixture();
    client.channels.cache.set('voice', { ...channel, type: ChannelType.GuildVoice });
    client.channels.cache.set('denied', { ...channel, permissionsFor: () => ({ has: () => false }) });
    assert.deepEqual(getSendableChannels(client), [channel]);
});

test('preserves multiline content and disables mention notifications', async () => {
    const { client, sent } = fixture();
    await sendTerminalMessage(client, '123', 'first line\nsecond line @everyone');
    assert.deepEqual(sent, [{ content: 'first line\nsecond line @everyone', allowedMentions: { parse: [], repliedUser: false } }]);
});

test('rejects empty, oversized and unavailable destinations without sending', async () => {
    const { client, channel, sent } = fixture();
    await assert.rejects(sendTerminalMessage(client, '123', ' \n'));
    await assert.rejects(sendTerminalMessage(client, '123', 'x'.repeat(2001)));
    await assert.rejects(sendTerminalMessage(client, 'missing', 'hello'));
    channel.permissionsFor = () => ({ has: () => false });
    await assert.rejects(sendTerminalMessage(client, '123', 'hello'));
    assert.equal(sent.length, 0);
});

test('accepts the length boundary and propagates send failures', async () => {
    const { client, channel, sent } = fixture();
    await sendTerminalMessage(client, '123', 'x'.repeat(2000));
    assert.equal(sent.length, 1);
    channel.send = async () => { throw new Error('network failure'); };
    await assert.rejects(sendTerminalMessage(client, '123', 'retry'), /network failure/);
});

test('screen supports selection, confirmation, retry, menu and cleanup', async () => {
    const { client, channel, sent } = fixture();
    const input = new PassThrough();
    input.isTTY = true;
    input.setRawMode = () => {};
    const output = new PassThrough();
    output.isTTY = true;
    output.columns = 100;
    output.rows = 30;
    let rendered = '';
    output.on('data', chunk => { rendered += chunk.toString(); });
    const screen = setupTerminalMessageSender(client, { input, output, captureLogs: false });
    try {
        const channels = screen.children.find(child => child.type === 'list' && !child.hidden);
        const editor = screen.children.find(child => child.type === 'textarea');
        const confirmation = screen.children.find(child => child.children.some(candidate => candidate.type === 'list'));
        const actions = confirmation.children.find(child => child.type === 'list');
        screen.program.emit('keypress', '\r', { name: 'enter', full: 'enter' });
        await new Promise(resolve => setImmediate(resolve));
        assert.equal(screen.focused === editor, true);
        editor.setValue('first\nsecond');
        screen.program.emit('keypress', '\x13', { name: 's', ctrl: true, full: 'C-s' });
        assert.equal(confirmation.hidden, false);
        assert.equal(screen.focused === actions, true);
        assert.equal(sent.length, 0);
        channel.send = async () => { throw new Error('network failure'); };
        actions.emit('select', actions.items[1], 1);
        await new Promise(resolve => setImmediate(resolve));
        assert.equal(editor.getValue(), 'first\nsecond');
        assert.equal(confirmation.hidden, true);
        channel.send = async payload => sent.push(payload);
        screen.program.emit('keypress', '\x13', { name: 's', ctrl: true, full: 'C-s' });
        actions.emit('select', actions.items[1], 1);
        actions.emit('select', actions.items[1], 1);
        await new Promise(resolve => setImmediate(resolve));
        assert.equal(sent.length, 1);
        assert.equal(editor.getValue(), '');
        screen.program.emit('keypress', '\x1b', { name: 'escape', full: 'escape' });
        assert.equal(screen.children.find(child => child.type === 'list' && child !== channels).hidden, false);
        assert.ok(rendered.length > 0);
        assert.ok(rendered.includes('本文'));
    } finally {
        screen.destroy();
        input.destroy();
        output.destroy();
    }
});