// Pure helpers for slash-command autocomplete (kept free of client/bot state so they can be tested).

// Discord accepts at most 25 choices per autocomplete response, each name/value <= 100 chars.
export const DISCORD_MAX_CHOICES = 25;
const MAX_LABEL_LENGTH = 100;

function normalize(text) {
    // Case/width-insensitive so "ずんだ", "ズンダ", "Cthulhu", "cthulhu" all match as expected.
    return String(text ?? "")
        .normalize("NFKC")
        .toLowerCase()
        .replace(/[ァ-ヶ]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0x60)); // katakana -> hiragana
}

// Ranks `items` against `query` (prefix matches first, then substring matches, preserving input order)
// and returns up to `limit` Discord choices { name, value }.
export function rankChoices(items, query, { label, value, keys }, limit = DISCORD_MAX_CHOICES) {
    const q = normalize(query).trim();
    const max = Math.min(Number.isFinite(limit) && limit > 0 ? limit : DISCORD_MAX_CHOICES, DISCORD_MAX_CHOICES);

    const prefix = [];
    const contains = [];
    for (const item of items) {
        if (!q) {
            prefix.push(item);
            continue;
        }
        const haystacks = keys(item).map(normalize);
        if (haystacks.some((h) => h.startsWith(q))) prefix.push(item);
        else if (haystacks.some((h) => h.includes(q))) contains.push(item);
        if (prefix.length >= max) break;
    }

    return [...prefix, ...contains].slice(0, max).map((item) => ({
        name: String(label(item)).slice(0, MAX_LABEL_LENGTH),
        value: String(value(item)).slice(0, MAX_LABEL_LENGTH),
    }));
}

// VOICEVOX speakers ({ id, speakerName, styleName, fqn }) -> choices whose value is the style id,
// which is what /tts on|param|speaker already parse.
export function speakerChoices(speakers, query, limit) {
    return rankChoices(
        speakers,
        query,
        {
            label: (s) => `${s.speakerName}（${s.styleName}）/ ${s.id}`,
            value: (s) => s.id,
            keys: (s) => [s.speakerName, s.styleName, `${s.speakerName}${s.styleName}`, String(s.id)],
        },
        limit
    );
}

// BCDice game systems ({ id, name, sortKey }) -> choices whose value is the system id.
export function gameSystemChoices(systems, query, limit) {
    return rankChoices(
        systems,
        query,
        {
            label: (g) => `${g.name}（${g.id}）`,
            value: (g) => g.id,
            keys: (g) => [g.id, g.name, g.sortKey ?? ""],
        },
        limit
    );
}
