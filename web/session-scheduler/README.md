This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Discordログイン設定

1. [Discord Developer Portal](https://discord.com/developers/applications) でアプリケーションを作成し、OAuth2の Redirect URL に `http://localhost:3000/api/auth/callback` を登録する。
2. `.env` に以下を設定する。
   - `DISCORD_CLIENT_ID` / `DISCORD_CLIENT_SECRET`: OAuth2の認証情報
   - `DISCORD_REDIRECT_URI`: 上記で登録したコールバックURL
   - `DISCORD_GUILD_ID`: ログインを許可するDiscordサーバー(ギルド)のID
   - `SESSION_SECRET`: セッションCookie署名用のランダムな文字列 (`openssl rand -hex 32` など)
3. ログインを許可されるのは `DISCORD_GUILD_ID` のサーバーメンバーのみで、表示名はそのサーバーのニックネーム（サーバープロフィール）を優先して使用する。

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
