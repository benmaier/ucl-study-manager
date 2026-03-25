import type { ChatRouteConfig } from "ucl-chat-widget/server";

export const chatConfig: ChatRouteConfig = {
  provider: (process.env.CHAT_PROVIDER as "anthropic" | "openai" | "gemini") || "anthropic",
  conversationsDir: process.env.CONVERSATIONS_DIR || "data/conversations",
  traceDir: process.env.TRACE_DIR,
  debugStreams: !!process.env.DEBUG_STREAMS,
  apiBasePath: "/api",
  // TODO: inject DatabaseWriter via extraWriters once participant context is available per-request
  // extraWriters: [new DatabaseWriter(pool, participantId, stageId, hashes)],
};
