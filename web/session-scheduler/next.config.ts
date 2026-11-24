import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // `next build` emits .next/standalone (server.js + only the traced node_modules) for the Docker
  // runtime image. Has no effect on `next dev`.
  output: "standalone",
  serverExternalPackages: ['@prisma/client'],
  images: {
    // Discord avatars (session user, guild member list).
    remotePatterns: [{ protocol: "https", hostname: "cdn.discordapp.com" }],
  },
  allowedDevOrigins: (process.env.ALLOWED_DEV_ORIGINS ?? "")
    .split(",")
    .map((hostname) => hostname.trim())
    .filter(Boolean),
};

export default nextConfig;
