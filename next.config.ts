import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["ucl-study-llm-chat-api"],
  // Disable Next.js's client-side router cache so back/forward to /study
  // re-fetches from the server. Without this, the router can hand back a
  // stale RSC payload — different stage, frozen timer, dead buttons.
  experimental: {
    staleTimes: {
      dynamic: 0,
      static: 30,
    },
  },
};

export default nextConfig;
