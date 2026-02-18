import readline from 'readline';
// Discordクライアントのインスタンスを外部から受け取る
export function setupTerminalMessageSender(client) {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    rl.on('line', (input) => {
        // 1行で channel-id と message をスペース区切りで受け取る
        const firstSpace = input.indexOf(' ');
        if (firstSpace === -1) return;
        const channelId = input.slice(0, firstSpace);
        const message = input.slice(firstSpace + 1);
        const channel = client.channels.cache.get(channelId);
        if (!channel) {
            console.log('チャンネルが見つかりません。');
        } else {
            channel.send(message)
                .then(() => console.log('メッセージを送信しました'))
                .catch(err => console.error('送信失敗:', err));
        }
    });
}
