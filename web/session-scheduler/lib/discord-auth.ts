import crypto from "node:crypto";
import { cookies } from "next/headers";
import type { NextRequest } from "next/server";

const DISCORD_API = "https://discord.com/api/v10";

export const SESSION_COOKIE = "session";
export const STATE_COOKIE = "oauth_state";

export type SessionUser = {
  id: string;
  username: string;
  displayName: string;
};

type DiscordGuildMember = {
  nick: string | null;
  user: {
    id: string;
    username: string;
    global_name: string | null;
  };
};

export type GuildMemberSummary = {
  id: string;
  username: string;
  displayName: string;
};

export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function getSessionSecret(): string {
  return requireEnv("SESSION_SECRET");
}

function sign(payload: string): string {
  return crypto.createHmac("sha256", getSessionSecret()).update(payload).digest("base64url");
}

// Signs the session so the cookie value cannot be forged by the client.
export function encodeSession(user: SessionUser): string {
  const payload = Buffer.from(JSON.stringify(user)).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

function decodeSession(token: string): SessionUser | null {
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;

  const expected = Buffer.from(sign(payload));
  const actual = Buffer.from(signature);
  if (expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) {
    return null;
  }

  try {
    return JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as SessionUser;
  } catch {
    return null;
  }
}

export async function getSession(): Promise<SessionUser | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return decodeSession(token);
}

export function buildAuthorizeUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: requireEnv("DISCORD_CLIENT_ID"),
    redirect_uri: requireEnv("DISCORD_REDIRECT_URI"),
    response_type: "code",
    scope: "identify guilds.members.read",
    state,
  });
  console.log("Building Discord authorize URL", `${DISCORD_API}/oauth2/authorize?${params.toString()}`);
  return `${DISCORD_API}/oauth2/authorize?${params.toString()}`;
}

export async function exchangeCodeForToken(code: string): Promise<string> {
  const body = new URLSearchParams({
    client_id: requireEnv("DISCORD_CLIENT_ID"),
    client_secret: requireEnv("DISCORD_CLIENT_SECRET"),
    grant_type: "authorization_code",
    code,
    redirect_uri: requireEnv("DISCORD_REDIRECT_URI"),
  });

  const res = await fetch(`${DISCORD_API}/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) {
    throw new Error(`Failed to exchange authorization code: ${res.status}`);
  }

  const data = (await res.json()) as { access_token: string };
  return data.access_token;
}

// Returns null when the authenticated user is not a member of the target guild.
export async function fetchGuildMember(accessToken: string): Promise<DiscordGuildMember | null> {
  const guildId = requireEnv("DISCORD_GUILD_ID");
  const res = await fetch(`${DISCORD_API}/users/@me/guilds/${guildId}/member`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (res.status === 404) return null;
  if (!res.ok) {
    throw new Error(`Failed to fetch guild member: ${res.status}`);
  }

  return res.json() as Promise<DiscordGuildMember>;
}

type DiscordListedGuildMember = {
  nick: string | null;
  user: {
    id: string;
    username: string;
    global_name: string | null;
    bot?: boolean;
  };
};

// Lists every (non-bot) member of the target guild using the bot token, for the event creator to pick
// participants from. Requires the application's "Server Members Intent" to be enabled in the Discord
// Developer Portal, since `GET /guilds/{id}/members` is a privileged-intent endpoint. A descriptive
// User-Agent is required too: Cloudflare blocks this endpoint with a 403 for generic/default ones.
export async function fetchGuildMembers(): Promise<GuildMemberSummary[]> {
  const guildId = requireEnv("DISCORD_GUILD_ID");
  const botToken = requireEnv("DISCORD_BOT_TOKEN");

  const members: GuildMemberSummary[] = [];
  let after = "0";
  for (;;) {
    const params = new URLSearchParams({ limit: "1000", after });
    const res = await fetch(`${DISCORD_API}/guilds/${guildId}/members?${params.toString()}`, {
      headers: {
        Authorization: `Bot ${botToken}`,
        "User-Agent": "DiscordBot (https://github.com/antem0613/bit-discord-bot, 1.0)",
      },
    });
    if (!res.ok) {
      throw new Error(`Failed to fetch guild members: ${res.status}`);
    }

    const page = (await res.json()) as DiscordListedGuildMember[];
    if (page.length === 0) break;

    for (const m of page) {
      if (m.user.bot) continue;
      members.push({
        id: m.user.id,
        username: m.user.username,
        displayName: m.nick ?? m.user.global_name ?? m.user.username,
      });
    }

    if (page.length < 1000) break;
    after = page[page.length - 1].user.id;
  }

  return members;
}

// Constant-time comparison against `BOT_EVENTS_SECRET`, shared by every bot-only API route (event
// creation, day-before reminders, ...). The bot already has the relevant Discord profile/context from
// the interaction itself, so unlike the website there's no session cookie here — just this shared secret.
export function verifyBotRequestAuth(request: NextRequest): boolean {
  const expected = process.env.BOT_EVENTS_SECRET;
  if (!expected) return false;

  const [scheme, token] = (request.headers.get("authorization") ?? "").split(" ");
  if (scheme !== "Bearer" || !token) return false;

  const expectedBuf = Buffer.from(expected);
  const tokenBuf = Buffer.from(token);
  return expectedBuf.length === tokenBuf.length && crypto.timingSafeEqual(expectedBuf, tokenBuf);
}
