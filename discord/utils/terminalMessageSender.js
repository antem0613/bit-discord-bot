import blessed from 'blessed';
import { ChannelType, PermissionFlagsBits } from 'discord.js';
import { format } from 'node:util';

export function getSendableChannels(client) {
    return [...client.channels.cache.values()]
        .filter(channel => {
            if (![ChannelType.GuildText, ChannelType.GuildAnnouncement].includes(channel.type)) return false;
            return channel.permissionsFor(client.user)?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages]);
        })
        .sort((first, second) => `${first.guild.name}/${first.name}`.localeCompare(`${second.guild.name}/${second.name}`, 'ja'));
}

export async function sendTerminalMessage(client, channelId, content) {
    if (!content.trim()) throw new Error('本文を入力してください。');
    if (content.length > 2000) throw new Error('本文は2,000文字以内にしてください。');
    const channel = getSendableChannels(client).find(candidate => candidate.id === channelId);
    if (!channel) throw new Error('送信先が見つからないか、送信権限がありません。');
    await channel.send({ content, allowedMentions: { parse: [], repliedUser: false } });
}

export function setupTerminalMessageSender(client, options = {}) {
    const input = options.input ?? process.stdin;
    const output = options.output ?? process.stdout;
    if (!input.isTTY || !output.isTTY) {
        console.log('[Console] 対話画面にはTTYが必要です。Dockerでは stdin_open と tty を有効にしてください。');
        return null;
    }

    const screen = blessed.screen({ input, output, smartCSR: true, forceUnicode: true, fullUnicode: true, ignoreLocked: ['C-s', 'C-c', 'escape'], title: 'Discord Bot Console' });
    if (!output.columns) screen.program.cols = 80;
    if (!output.rows) screen.program.rows = 24;
    screen.alloc();
    const header = blessed.box({ parent: screen, top: 0, height: 1, width: '100%', content: ' Discord Bot / メッセージ送信', style: { bg: 'cyan', fg: 'black', bold: true } });
    const search = blessed.textbox({ parent: screen, top: 1, left: 0, width: '35%', height: 3, label: ' 検索 (/キー) ', border: 'line', keys: true, mouse: true });
    const channels = blessed.list({ parent: screen, top: 4, left: 0, width: '35%', bottom: 7, label: ' 送信先 (上下 / Enter) ', border: 'line', keys: true, mouse: true, scrollable: true, style: { selected: { bg: 'cyan', fg: 'black' }, border: { fg: 'cyan' } } });
    const editor = blessed.textarea({ parent: screen, top: 1, left: '35%', right: 0, bottom: 7, label: ' 本文 ', border: 'line', keys: true, mouse: true, scrollable: true, style: { border: { fg: 'green' } } });
    const logs = blessed.log({ parent: screen, bottom: 2, height: 5, width: '100%', label: ' 送信結果 / Bot ログ ', border: 'line', scrollback: 100, mouse: true, scrollable: true });
    const footer = blessed.box({ parent: screen, bottom: 0, height: 2, width: '100%', content: ' Enter: 改行 | Ctrl+S: 送信確認 | Esc: メニュー\n Ctrl+P → Ctrl+Q: Docker切断 | Ctrl+C: コンソール終了' });
    let availableChannels = [];
    let selectedChannel = null;
    let busy = false;
    let confirming = false;
    let pendingContent = '';

    const originalConsole = {};
    if (options.captureLogs !== false) {
        for (const method of ['log', 'info', 'warn', 'error', 'debug']) {
            originalConsole[method] = console[method];
            console[method] = (...args) => {
                logs.log(`[${method}] ${format(...args)}`);
                screen.render();
            };
        }
    }
    const report = message => {
        logs.log(`${new Date().toLocaleTimeString('ja-JP')} ${message}`);
        screen.render();
    };
    screen.on('destroy', () => {
        for (const [method, original] of Object.entries(originalConsole)) console[method] = original;
    });

    function refreshChannels() {
        const query = search.getValue().trim().toLocaleLowerCase();
        availableChannels = getSendableChannels(client).filter(channel => `${channel.guild.name}/${channel.name}`.toLocaleLowerCase().includes(query));
        channels.setItems(availableChannels.map(channel => `${channel.guild.name} / #${channel.name}`));
        if (!availableChannels.length) report('送信可能なチャンネルがありません。メニューから再取得できます。');
        screen.render();
    }

    function focusEditor() {
        editor.focus();
        editor.readInput();
        screen.render();
    }

    editor.on('focus', () => editor.readInput());
    search.on('focus', () => search.readInput());

    channels.key('/', () => {
        search.focus();
        screen.render();
    });
    search.on('submit', () => {
        refreshChannels();
        channels.focus();
        screen.render();
    });

    const menu = blessed.list({ parent: screen, top: 'center', left: 'center', width: '70%', height: 10, label: ' メニュー ', border: 'line', keys: true, mouse: true, hidden: true, style: { bg: 'black', selected: { bg: 'cyan', fg: 'black' } }, items: ['本文に戻る', '送信確認', '送信先を変更 / 一覧を再取得', '本文を破棄', 'コンソールを終了 (Botは継続)'] });
    const confirmation = blessed.box({ parent: screen, top: 'center', left: 'center', width: '90%', height: '80%', label: ' 送信確認 ', border: 'line', hidden: true, style: { bg: 'black', border: { fg: 'yellow' } } });
    const preview = blessed.box({ parent: confirmation, top: 0, left: 1, right: 1, bottom: 4, scrollable: true, keys: true, mouse: true, alwaysScroll: true });
    const confirmActions = blessed.list({ parent: confirmation, bottom: 0, height: 3, left: 1, right: 1, keys: true, mouse: true, items: ['本文に戻る', 'この送信先に送信する'], style: { selected: { bg: 'yellow', fg: 'black' } } });

    function cancelConfirmation() {
        confirming = false;
        confirmation.hide();
        focusEditor();
    }

    function requestSend() {
        if (busy || confirming) return;
        const content = editor.getValue();
        if (!selectedChannel) return report('まず一覧から送信先を選択してください。');
        if (!content.trim()) return report('本文を入力してください。');
        if (content.length > 2000) return report(`本文は2,000文字以内にしてください (現在 ${content.length}文字)。`);
        pendingContent = content;
        confirming = true;
        preview.setContent(`送信先: ${selectedChannel.guild.name} / #${selectedChannel.name}\n文字数: ${content.length}/2000\nメンション通知: 無効\n\n${content}`);
        preview.setScroll(0);
        confirmActions.select(0);
        confirmation.show();
        confirmation.setFront();
        confirmActions.focus();
        screen.render();
    }

    confirmActions.on('select', async (_item, index) => {
        if (busy) return;
        if (index === 0) return cancelConfirmation();
        busy = true;
        report('送信中...');
        try {
            await sendTerminalMessage(client, selectedChannel.id, pendingContent);
            editor.clearValue();
            report(`送信しました: ${selectedChannel.guild.name} / #${selectedChannel.name}`);
        } catch (error) {
            report(`送信失敗: ${error.message} (本文は保持しています)`);
        } finally {
            busy = false;
            cancelConfirmation();
        }
    });
    channels.on('select', (_item, index) => {
        selectedChannel = availableChannels[index];
        if (!selectedChannel) return;
        header.setContent(` Discord Bot / ${selectedChannel.guild.name} / #${selectedChannel.name}`);
        editor.setLabel(` 本文 → #${selectedChannel.name} `);
        focusEditor();
    });
    menu.on('select', (_item, index) => {
        menu.hide();
        if (index === 4) return screen.destroy();
        if (index === 2) {
            refreshChannels();
            channels.focus();
            screen.render();
            return;
        }
        if (index === 3) editor.clearValue();
        focusEditor();
        if (index === 1) requestSend();
    });
    screen.key('C-s', () => {
        if (!menu.hidden) return;
        requestSend();
    });
    screen.key('escape', () => {
        if (busy) return;
        if (confirming) return cancelConfirmation();
        if (!menu.hidden) {
            menu.hide();
            focusEditor();
        } else {
            menu.select(0);
            menu.show();
            menu.setFront();
            menu.focus();
        }
        screen.render();
    });
    screen.key('C-c', () => {
        if (!busy) screen.destroy();
    });
    screen.on('resize', () => {
        footer.setContent(screen.width < 70 ? ' Esc: メニュー / Ctrl+S: 送信\n Ctrl+C: コンソール終了' : ' Enter: 改行 | Ctrl+S: 送信確認 | Esc: メニュー\n Ctrl+P → Ctrl+Q: Docker切断 | Ctrl+C: コンソール終了');
        screen.render();
    });
    refreshChannels();
    channels.focus();
    screen.render();
    return screen;
}
