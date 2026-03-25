import type { ChatRouteConfig } from "ucl-chat-widget/server";

/**
 * Chat configuration for the widget.
 *
 * Returns a fresh config each time so it picks up env vars
 * set dynamically at login (CHAT_PROVIDER, API keys).
 */
export function getChatConfig(): ChatRouteConfig {
  return {
    provider: (process.env.CHAT_PROVIDER as "anthropic" | "openai" | "gemini") || "anthropic",
    conversationsDir: process.env.CONVERSATIONS_DIR || "data/conversations",
    traceDir: process.env.TRACE_DIR,
    debugStreams: !!process.env.DEBUG_STREAMS,
    apiBasePath: "/api",
  };
}
