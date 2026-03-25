import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["ucl-study-llm-chat-api"],
};

export default nextConfig;
