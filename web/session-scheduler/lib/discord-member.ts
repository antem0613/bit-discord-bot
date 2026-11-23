// Discord guild-member helpers shared by the app and proxy.ts (no `next/headers` dependency).

export const DISCORD_API = "https://discord.com/api/v10";
export const DISCORD_BOT_USER_AGENT = "DiscordBot (https://github.com/antem0613/bit-discord-bot, 1.0)";
const DISCORD_CDN = "https://cdn.discordapp.com";
const AVATAR_HASH_PATTERN = /^(a_)?[0-9a-f]{32}$/;

export type DiscordGuildMember = {
  nick: string | null;
  avatar?: string | null; // server-specific avatar hash
  user: {
    id: string;
    username: string;
    global_name: string | null;
    avatar: string | null;
    bot?: boolean;
  };
};

export function memberDisplayName(member: DiscordGuildMember): string {
  return member.nick ?? member.user.global_name ?? member.user.username;
}

// Discord's built-in default avatar for users without one (new username system: (id >> 22) % 6).
export function defaultAvatarUrl(userId: string): string {
  let index = 0;
  try {
    index = Number((BigInt(userId) >> BigInt(22)) % BigInt(6));
  } catch {
    // non-numeric id: keep index 0
  }
  return `${DISCORD_CDN}/embed/avatars/${index}.png`;
}

// Picks the server avatar first, then the user's global avatar, then Discord's default one.
export function discordAvatarUrl(member: DiscordGuildMember, size = 128): string {
  const userId = member.user.id;
  const guildId = process.env.DISCORD_GUILD_ID;
  if (guildId && member.avatar && AVATAR_HASH_PATTERN.test(member.avatar)) {
    return `${DISCORD_CDN}/guilds/${guildId}/users/${userId}/avatars/${member.avatar}.png?size=${size}`;
  }
  if (member.user.avatar && AVATAR_HASH_PATTERN.test(member.user.avatar)) {
    return `${DISCORD_CDN}/avatars/${userId}/${member.user.avatar}.png?size=${size}`;
  }
  return defaultAvatarUrl(userId);
}

export type MembershipCheck =
  | { status: "member"; member: DiscordGuildMember }
  | { status: "not_member" }
  | { status: "unknown" }; // Discord unreachable / misconfigured: caller decides

// Looks a user up in the target guild with the bot token (used to re-verify sessions).
export async function checkGuildMembership(userId: string): Promise<MembershipCheck> {
  const guildId = process.env.DISCORD_GUILD_ID;
  const botToken = process.env.DISCORD_BOT_TOKEN;
  if (!guildId || !botToken || !/^\d+$/.test(userId)) {
    return /^\d+$/.test(userId) ? { status: "unknown" } : { status: "not_member" };
  }

  try {
    const res = await fetch(`${DISCORD_API}/guilds/${guildId}/members/${userId}`, {
      headers: { Authorization: `Bot ${botToken}`, "User-Agent": DISCORD_BOT_USER_AGENT },
      cache: "no-store",
    });
    if (res.status === 404) return { status: "not_member" };
    if (!res.ok) {
      console.error(`[auth] Guild membership check failed: ${res.status}`);
      return { status: "unknown" };
    }
    return { status: "member", member: (await res.json()) as DiscordGuildMember };
  } catch (error) {
    console.error("[auth] Guild membership check errored:", error);
    return { status: "unknown" };
  }
}
