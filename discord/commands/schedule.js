import { SlashCommandBuilder } from "@discordjs/builders";
import { ActionRowBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } from "discord.js";

const SCHEDULER_BASE_URL = process.env.SCHEDULER_BASE_URL || "http://antemvpn0613.tplinkdns.com:9335";
const CREATE_MODAL_CUSTOM_ID = "schedule:create";

export const data = new SlashCommandBuilder()
  .setName("schedule")
  .setDescription("日程調整")
  .addSubcommand(subcommand => 
    subcommand.setName("site")
       .setDescription("日程調整のサイトのリンクを貼ります。")
  )
  .addSubcommand(subcommand =>
    subcommand.setName("create")
       .setDescription("日程調整イベントを作成します。")
  )
  .addSubcommand(subcommand =>
    subcommand.setName("list")
       .setDescription("指定した月（または日）の確定済みイベント一覧を表示します。")
       .addIntegerOption(option => option
         .setName("month")
         .setDescription("月（1〜12）")
         .setRequired(true)
         .setMinValue(1)
         .setMaxValue(12)
       )
       .addIntegerOption(option => option
         .setName("year")
         .setDescription("年（省略時は今年）")
         .setRequired(false)
       )
       .addIntegerOption(option => option
         .setName("day")
         .setDescription("日（省略時はその月全体）")
         .setRequired(false)
         .setMinValue(1)
         .setMaxValue(31)
       )
  )
  .addSubcommand(subcommand =>
    subcommand.setName("recruiting")
       .setDescription("現在募集中（回答受付中）のイベント一覧を表示します。")
  )
  .addSubcommand(subcommand =>
    subcommand.setName("mine")
       .setDescription("自分が参加していて、実施日が今日以降の確定イベント一覧を表示します。")
  );

export const execute = async (interaction) => {
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === "site") {
        await interaction.reply(`日程調整のサイト: ${SCHEDULER_BASE_URL}`);
        return;
    }

    if (subcommand === "create") {
        if (process.env.DISCORD_GUILD_ID && interaction.guildId !== process.env.DISCORD_GUILD_ID) {
            await interaction.reply({ content: "このサーバーでは日程調整イベントの作成はできません。", ephemeral: true });
            return;
        }

        const modal = new ModalBuilder()
            .setCustomId(CREATE_MODAL_CUSTOM_ID)
            .setTitle("日程調整イベントを作成");

        const titleInput = new TextInputBuilder()
            .setCustomId("title")
            .setLabel("タイトル")
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setMaxLength(100);

        const descriptionInput = new TextInputBuilder()
            .setCustomId("description")
            .setLabel("説明（任意）")
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(false)
            .setMaxLength(1000);

        const datesInput = new TextInputBuilder()
            .setCustomId("dates")
            .setLabel("候補日（改行かカンマ区切りでYYYY-MM-DD）")
            .setStyle(TextInputStyle.Paragraph)
            .setPlaceholder("2026-10-10\n2026-10-12\n2026-10-15")
            .setRequired(true);

        const deadlineInput = new TextInputBuilder()
            .setCustomId("deadline")
            .setLabel("回答期限（任意・YYYY-MM-DD HH:mm）")
            .setStyle(TextInputStyle.Short)
            .setPlaceholder("2026-10-09 20:00")
            .setRequired(false);

        modal.addComponents(
            new ActionRowBuilder().addComponents(titleInput),
            new ActionRowBuilder().addComponents(descriptionInput),
            new ActionRowBuilder().addComponents(datesInput),
            new ActionRowBuilder().addComponents(deadlineInput),
        );

        await interaction.showModal(modal);
        return;
    }

    if (subcommand === "list") {
        if (process.env.DISCORD_GUILD_ID && interaction.guildId !== process.env.DISCORD_GUILD_ID) {
            await interaction.reply({ content: "このサーバーでは日程調整機能は利用できません。", ephemeral: true });
            return;
        }

        const month = interaction.options.getInteger("month", true);
        const year = interaction.options.getInteger("year");
        const day = interaction.options.getInteger("day");

        await interaction.deferReply({ ephemeral: true });

        const params = new URLSearchParams({ month: String(month) });
        if (year !== null) params.set("year", String(year));
        if (day !== null) params.set("day", String(day));

        try {
            const res = await fetch(`${SCHEDULER_BASE_URL}/api/bot/events?${params.toString()}`, {
                headers: { Authorization: `Bearer ${process.env.BOT_EVENTS_SECRET}` },
            });
            const data = await res.json();
            if (!res.ok) {
                await interaction.editReply(`イベント一覧を取得できませんでした: ${data.error ?? res.status}`);
                return;
            }

            await interaction.editReply(formatEventListMessage(data));
        } catch (error) {
            console.error("[schedule list] Failed to call scheduler API:", error);
            await interaction.editReply("イベント一覧の取得中にエラーが発生しました。しばらくしてからもう一度お試しください。");
        }
        return;
    }

    if (subcommand === "recruiting") {
        if (process.env.DISCORD_GUILD_ID && interaction.guildId !== process.env.DISCORD_GUILD_ID) {
            await interaction.reply({ content: "このサーバーでは日程調整機能は利用できません。", ephemeral: true });
            return;
        }

        await interaction.deferReply({ ephemeral: true });

        try {
            const res = await fetch(`${SCHEDULER_BASE_URL}/api/bot/events/recruiting`, {
                headers: { Authorization: `Bearer ${process.env.BOT_EVENTS_SECRET}` },
            });
            const data = await res.json();
            if (!res.ok) {
                await interaction.editReply(`募集中のイベント一覧を取得できませんでした: ${data.error ?? res.status}`);
                return;
            }

            await interaction.editReply(formatRecruitingEventsMessage(data.events));
        } catch (error) {
            console.error("[schedule recruiting] Failed to call scheduler API:", error);
            await interaction.editReply("イベント一覧の取得中にエラーが発生しました。しばらくしてからもう一度お試しください。");
        }
        return;
    }

    if (subcommand === "mine") {
        if (process.env.DISCORD_GUILD_ID && interaction.guildId !== process.env.DISCORD_GUILD_ID) {
            await interaction.reply({ content: "このサーバーでは日程調整機能は利用できません。", ephemeral: true });
            return;
        }

        await interaction.deferReply({ ephemeral: true });

        const params = new URLSearchParams({ userId: interaction.user.id });

        try {
            const res = await fetch(`${SCHEDULER_BASE_URL}/api/bot/events/mine?${params.toString()}`, {
                headers: { Authorization: `Bearer ${process.env.BOT_EVENTS_SECRET}` },
            });
            const data = await res.json();
            if (!res.ok) {
                await interaction.editReply(`参加予定のイベント一覧を取得できませんでした: ${data.error ?? res.status}`);
                return;
            }

            await interaction.editReply(formatMyUpcomingEventsMessage(data.events));
        } catch (error) {
            console.error("[schedule mine] Failed to call scheduler API:", error);
            await interaction.editReply("イベント一覧の取得中にエラーが発生しました。しばらくしてからもう一度お試しください。");
        }
        return;
    }
};

// Discord message content is capped at 2000 characters; trims lines (from the end) until the joined
// message fits, appending a "...and N more" marker so a busy month never fails to send.
function truncateLines(lines, maxLength) {
    let shown = lines;
    while (shown.length > 0 && `${shown.join("\n")}`.length > maxLength) {
        shown = shown.slice(0, -1);
    }
    const omitted = lines.length - shown.length;
    return { shown, omitted };
}

function formatEventListMessage({ year, month, day, events }) {
    const label = day ? `${year}年${month}月${day}日` : `${year}年${month}月`;

    if (events.length === 0) {
        return `${label} に確定しているイベントはありません。`;
    }

    const lines = events.map((e) => {
        const title = e.cancelled ? `~~${e.title}~~（キャンセル）` : e.title;
        const room = !e.cancelled && e.roomLabel ? `（${e.roomLabel}）` : "";
        return `- ${e.date} ${title}${room}`;
    });

    const header = `${label} の確定イベント一覧（${events.length}件）`;
    const { shown, omitted } = truncateLines(lines, 1800);
    const suffix = omitted > 0 ? `\n…他 ${omitted} 件` : "";

    return `${header}\n${shown.join("\n")}${suffix}`;
}

function formatRecruitingEventsMessage(events) {
    if (events.length === 0) {
        return "現在募集中のイベントはありません。";
    }

    const lines = events.map((e) => {
        const dates = e.candidateDates.join("、");
        const deadline = e.schedulingDeadline ? `（回答期限: ${e.schedulingDeadline}）` : "";
        return `- 「${e.title}」 主催: ${e.creatorDisplayName}\n  候補日: ${dates}${deadline}\n  ${e.url}`;
    });

    const header = `募集中のイベント一覧（${events.length}件）`;
    const { shown, omitted } = truncateLines(lines, 1800);
    const suffix = omitted > 0 ? `\n…他 ${omitted} 件` : "";

    return `${header}\n${shown.join("\n")}${suffix}`;
}

function formatMyUpcomingEventsMessage(events) {
    if (events.length === 0) {
        return "参加していて実施日が今日以降の確定イベントはありません。";
    }

    const lines = events.map((e) => {
        const dates = e.finalDates.map((f) => (f.roomLabel ? `${f.date}（${f.roomLabel}）` : f.date)).join("、");
        return `- 「${e.title}」\n  実施日: ${dates}\n  ${e.url}`;
    });

    const header = `参加予定のイベント一覧（${events.length}件）`;
    const { shown, omitted } = truncateLines(lines, 1800);
    const suffix = omitted > 0 ? `\n…他 ${omitted} 件` : "";

    return `${header}\n${shown.join("\n")}${suffix}`;
}

// Parses the free-text candidate-dates field (newline- or comma-separated) into a deduplicated list of
// "YYYY-MM-DD" strings. Returns the invalid (non-matching) tokens too, so the caller can report them.
function parseCandidateDates(raw) {
    const parts = raw.split(/[\n,、]+/).map((s) => s.trim()).filter(Boolean);
    const dates = new Set();
    const invalid = [];
    for (const part of parts) {
        if (/^\d{4}-\d{2}-\d{2}$/.test(part)) {
            dates.add(part);
        } else {
            invalid.push(part);
        }
    }
    return { dates: Array.from(dates), invalid };
}

// Normalizes "YYYY-MM-DD HH:mm" free text (or an already-ISO "YYYY-MM-DDTHH:mm") into the ISO-like shape
// the web app's deadline parser expects. Blank input means "no deadline".
function normalizeDeadline(raw) {
    const trimmed = raw.trim();
    return trimmed ? trimmed.replace(" ", "T") : "";
}

// Handles the "schedule create" modal submission: validates the free-text input, then asks the
// scheduler web app to create the event on behalf of whoever submitted the modal (identified directly
// from the interaction, so they never need to have logged into the website themselves).
export async function handleModalSubmit(interaction) {
    if (interaction.customId !== CREATE_MODAL_CUSTOM_ID) return;

    await interaction.deferReply({ ephemeral: true });

    const title = interaction.fields.getTextInputValue("title").trim();
    const description = interaction.fields.getTextInputValue("description").trim();
    const datesRaw = interaction.fields.getTextInputValue("dates");
    const deadlineRaw = interaction.fields.getTextInputValue("deadline");

    const { dates, invalid } = parseCandidateDates(datesRaw);
    if (invalid.length > 0) {
        await interaction.editReply(
            `候補日の形式が正しくありません: ${invalid.join(", ")}\nYYYY-MM-DD の形式で、改行またはカンマ区切りで入力してください。`
        );
        return;
    }
    if (dates.length === 0) {
        await interaction.editReply("候補日を1つ以上入力してください。");
        return;
    }

    const { user, member } = interaction;
    const displayName = member?.nickname ?? user.globalName ?? user.username;

    try {
        const res = await fetch(`${SCHEDULER_BASE_URL}/api/bot/events`, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${process.env.BOT_EVENTS_SECRET}`,
                "Content-Type": "application/json; charset=utf-8",
            },
            body: JSON.stringify({
                creator: { id: user.id, username: user.username, displayName },
                title,
                description,
                candidateDates: dates,
                schedulingDeadline: normalizeDeadline(deadlineRaw),
            }),
        });

        const data = await res.json();
        if (!res.ok) {
            await interaction.editReply(`イベントを作成できませんでした: ${data.error ?? res.status}`);
            return;
        }

        await interaction.editReply(`イベントを作成しました！\n${data.url}`);
    } catch (error) {
        console.error("[schedule create] Failed to call scheduler API:", error);
        await interaction.editReply("イベントの作成中にエラーが発生しました。しばらくしてからもう一度お試しください。");
    }
}
