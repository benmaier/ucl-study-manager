import type { ChatRouteConfig } from "ucl-chat-widget/server";

/**
 * Chat configuration for the widget.
 *
 * API keys are resolved at login time:
 * 1. From the database key pool (assign_api_key function) — preferred
 * 2. From environment variables (ANTHROPIC_API_KEY, etc.) — fallback
 *
 * The login handler sets process.env with the assigned key,
 * and the SDK reads it automatically.
 */
export const chatConfig: ChatRouteConfig = {
  provider: (process.env.CHAT_PROVIDER as "anthropic" | "openai" | "gemini") || "anthropic",
  conversationsDir: process.env.CONVERSATIONS_DIR || "data/conversations",
  traceDir: process.env.TRACE_DIR,
  debugStreams: !!process.env.DEBUG_STREAMS,
  apiBasePath: "/api",
};
