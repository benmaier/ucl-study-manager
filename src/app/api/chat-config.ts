import type { ChatRouteConfig } from "ucl-chat-widget/server";
import { cookies } from "next/headers";

/**
 * Build chat config per-request.
 * Provider comes from the participant's cohort (stored in cookie at login).
 * API keys come from the DB key pool (set in process.env at login).
 */
export async function getChatConfig(): Promise<ChatRouteConfig> {
  const cookieStore = await cookies();
  const provider = cookieStore.get("chat_provider")?.value as "anthropic" | "openai" | "gemini" | undefined;

  return {
    provider: provider || "anthropic",
    conversationsDir: process.env.CONVERSATIONS_DIR || "data/conversations",
    traceDir: process.env.TRACE_DIR,
    debugStreams: !!process.env.DEBUG_STREAMS,
    apiBasePath: "/api",
  };
}
