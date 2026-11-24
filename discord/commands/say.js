import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    InteractionContextType,
    MessageFlags,
    ModalBuilder,
    PermissionFlagsBits,
    SlashCommandBuilder,
    TextInputBuilder,
    TextInputStyle,
} from "discord.js";
import {
    MAX_CONTENT_LENGTH,
    NO_MENTIONS,
    POSTABLE_CHANNEL_TYPES,
    checkPostable,
    createSession,
    forgetSaidMessage,
    isSaidMessage,
    messageUrl,
    parseMessageLink,
    recordSaidMessage,
    takeSession,
} from "../utils/say.js";

// /say: post as the bot. Shown only to members with Manage Server by default; server admins can
// grant it to other roles under Server Settings > Integrations. The "Botの発言を編集/削除" message
// menus (commands/sayEdit.js, sayDelete.js) route their modal/buttons back here via "say:" custom IDs.
export const data = new SlashCommandBuilder()
    .setName("say")
    .setDescription("Botとして任意のチャンネルに発言します（本文はフォームで入力）")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setContexts(InteractionContextType.Guild)
    .addChannelOption(option => option
        .setName("channel")
        .setDescription("送信先（省略するとこのチャンネル）")
        .addChannelTypes(...POSTABLE_CHANNEL_TYPES)
        .setRequired(false))
    .addAttachmentOption(option => option
        .setName("file")
        .setDescription("添付する画像・ファイル（任意）")
        .setRequired(false));

const ephemeral = (content) => ({ content, flags: MessageFlags.Ephemeral, allowedMentions: NO_MENTIONS });

function contentInput({ value = "", required = true } = {}) {
    const input = new TextInputBuilder()
        .setCustomId("content")
        .setLabel("本文")
        .setStyle(TextInputStyle.Paragraph)
        .setMaxLength(MAX_CONTENT_LENGTH)
        .setRequired(required)
        .setPlaceholder("Botとして送信する内容（メンションは通知されません）");
    if (value) input.setValue(value);
    return input;
}

export async function execute(interaction) {
    const channel = interaction.options.getChannel("channel") ?? interaction.channel;
    const file = interaction.options.getAttachment("file");

    const problem = checkPostable(channel, interaction.guild.members.me, interaction.member, { withFile: Boolean(file) });
    if (problem) {
        await interaction.reply(ephemeral(problem));
        return;
    }

    const key = createSession(interaction.user.id, {
        action: "post",
        guildId: interaction.guildId,
        channelId: channel.id,
        file: file ? { url: file.url, name: file.name } : null,
    });

    const modal = new ModalBuilder()
        .setCustomId(`say:post:${key}`)
        .setTitle(`#${channel.name} にBotとして発言`.slice(0, 45))
        .addComponents(
            new ActionRowBuilder().addComponents(contentInput({ required: !file })),
            new ActionRowBuilder().addComponents(new TextInputBuilder()
                .setCustomId("replyTo")
                .setLabel("返信先メッセージのリンク（任意）")
                .setStyle(TextInputStyle.Short)
                .setRequired(false)
                .setPlaceholder("メッセージを右クリック →「メッセージリンクをコピー」")),
        );
    await interaction.showModal(modal);
}

// "Botの発言を編集" message menu.
export async function openEditModal(interaction) {
    const message = interaction.targetMessage;
    if (message.author.id !== interaction.client.user.id || !isSaidMessage(message.id)) {
        await interaction.reply(ephemeral("/say で送信したBotの発言だけ編集できます。"));
        return;
    }
    const problem = checkPostable(message.channel, interaction.guild.members.me, interaction.member);
    if (problem) {
        await interaction.reply(ephemeral(problem));
        return;
    }

    const key = createSession(interaction.user.id, { action: "edit", channelId: message.channelId, messageId: message.id });
    const modal = new ModalBuilder()
        .setCustomId(`say:edit:${key}`)
        .setTitle("Botの発言を編集")
        .addComponents(new ActionRowBuilder().addComponents(contentInput({ value: message.content, required: !message.attachments.size })));
    await interaction.showModal(modal);
}

// "Botの発言を削除" message menu: asks for confirmation with buttons.
export async function confirmDelete(interaction) {
    const message = interaction.targetMessage;
    if (message.author.id !== interaction.client.user.id || !isSaidMessage(message.id)) {
        await interaction.reply(ephemeral("/say で送信したBotの発言だけ削除できます。"));
        return;
    }
    const problem = checkPostable(message.channel, interaction.guild.members.me, interaction.member);
    if (problem) {
        await interaction.reply(ephemeral(problem));
        return;
    }

    const key = createSession(interaction.user.id, { action: "delete", channelId: message.channelId, messageId: message.id });
    const preview = message.content ? message.content.slice(0, 300) + (message.content.length > 300 ? "…" : "") : "（本文なし・添付のみ）";
    await interaction.reply({
        content: `この発言を削除しますか？元に戻せません。\n>>> ${preview}`,
        flags: MessageFlags.Ephemeral,
        allowedMentions: NO_MENTIONS,
        components: [new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`say:delete:${key}`).setLabel("削除する").setStyle(ButtonStyle.Danger),
            new ButtonBuilder().setCustomId(`say:cancel:${key}`).setLabel("やめる").setStyle(ButtonStyle.Secondary),
        )],
    });
}

export async function handleModalSubmit(interaction) {
    const [, action, key] = interaction.customId.split(":");
    const session = takeSession(key, interaction.user.id);
    if (!session || session.action !== action) {
        await interaction.reply(ephemeral("入力の有効期限が切れました。もう一度コマンドを実行してください。"));
        return;
    }
    const content = interaction.fields.getTextInputValue("content").trim();
    const channel = await interaction.client.channels.fetch(session.channelId).catch(() => null);

    // Permissions may have changed while the form was open.
    const problem = checkPostable(channel, interaction.guild.members.me, interaction.member, { withFile: Boolean(session.file) });
    if (problem) {
        await interaction.reply(ephemeral(problem));
        return;
    }

    if (action === "post") {
        if (!content && !session.file) {
            await interaction.reply(ephemeral("本文を入力してください。"));
            return;
        }
        const payload = { allowedMentions: NO_MENTIONS };
        if (content) payload.content = content;
        if (session.file) payload.files = [{ attachment: session.file.url, name: session.file.name }];

        const replyLink = interaction.fields.getTextInputValue("replyTo").trim();
        if (replyLink) {
            const target = parseMessageLink(replyLink);
            if (!target || target.channelId !== channel.id) {
                await interaction.reply(ephemeral("返信先は、送信先チャンネル内のメッセージのリンクを指定してください。"));
                return;
            }
            const exists = await channel.messages.fetch(target.messageId).then(() => true, () => false);
            if (!exists) {
                await interaction.reply(ephemeral("返信先のメッセージが見つかりません。"));
                return;
            }
            payload.reply = { messageReference: target.messageId, failIfNotExists: false };
        }

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        try {
            const sent = await channel.send(payload);
            recordSaidMessage({ messageId: sent.id, guildId: interaction.guildId, channelId: channel.id, authorId: interaction.user.id });
            console.log(`[say] ${interaction.user.tag} (${interaction.user.id}) posted to #${channel.name} (${channel.id}): ${sent.id}`);
            await interaction.editReply({ content: `送信しました: ${messageUrl(interaction.guildId, channel.id, sent.id)}`, allowedMentions: NO_MENTIONS });
        } catch (error) {
            console.error("[say] send failed:", error);
            await interaction.editReply("送信できませんでした。ファイルが大きすぎるか、権限が不足している可能性があります。");
        }
        return;
    }

    if (action === "edit") {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const message = await channel.messages.fetch(session.messageId).catch(() => null);
        if (!message || !isSaidMessage(message.id)) {
            await interaction.editReply("編集するメッセージが見つかりません。");
            return;
        }
        if (!content && !message.attachments.size) {
            await interaction.editReply("本文を空にはできません（添付がないため）。削除する場合は「Botの発言を削除」を使ってください。");
            return;
        }
        try {
            await message.edit({ content: content || "", allowedMentions: NO_MENTIONS });
            console.log(`[say] ${interaction.user.tag} (${interaction.user.id}) edited ${message.id} in #${channel.name}`);
            await interaction.editReply({ content: `編集しました: ${message.url}`, allowedMentions: NO_MENTIONS });
        } catch (error) {
            console.error("[say] edit failed:", error);
            await interaction.editReply("編集できませんでした。");
        }
    }
}

export async function handleButton(interaction) {
    const [, action, key] = interaction.customId.split(":");
    const session = takeSession(key, interaction.user.id);
    if (action === "cancel") {
        await interaction.update({ content: "削除をやめました。", components: [] });
        return;
    }
    if (action !== "delete" || !session || session.action !== "delete") {
        await interaction.update({ content: "有効期限が切れました。もう一度実行してください。", components: [] });
        return;
    }
    const channel = await interaction.client.channels.fetch(session.channelId).catch(() => null);
    const message = await channel?.messages.fetch(session.messageId).catch(() => null);
    if (!message) {
        forgetSaidMessage(session.messageId);
        await interaction.update({ content: "メッセージはすでに削除されています。", components: [] });
        return;
    }
    try {
        await message.delete();
        forgetSaidMessage(message.id);
        console.log(`[say] ${interaction.user.tag} (${interaction.user.id}) deleted ${message.id} in #${channel.name}`);
        await interaction.update({ content: "削除しました。", components: [] });
    } catch (error) {
        console.error("[say] delete failed:", error);
        await interaction.update({ content: "削除できませんでした。", components: [] });
    }
}
