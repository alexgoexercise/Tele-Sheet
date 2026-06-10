import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["teleproto", "ws"],
};

export default nextConfig;
