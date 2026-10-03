import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ['@prisma/client'],
  allowedDevOrigins: ["antemvpn0613.tplinkdns.com"],
};

export default nextConfig;
