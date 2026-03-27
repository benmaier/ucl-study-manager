import type { ChatRouteConfig } from "ucl-chat-widget/server";
import { cookies } from "next/headers";
import { assignApiKey } from "@/lib/key-pool";
import { prisma } from "@/lib/prisma";

/**
 * Build chat config per-request.
 *
 * On Vercel, each request can hit a different serverless instance,
 * so we can't rely on process.env mutations from the login route.
 * Instead, we resolve the provider and API key fresh each time
 * from the participant's cohort + the DB key pool.
 */
export async function getChatConfig(): Promise<ChatRouteConfig> {
  const cookieStore = await cookies();
  const participantId = cookieStore.get("participant_id")?.value;
  const providerFromCookie = cookieStore.get("chat_provider")?.value as "anthropic" | "openai" | "gemini" | undefined;

  let provider = providerFromCookie || "anthropic";

  // Fetch API key from DB and set in process.env for the SDK to pick up
  if (participantId) {
    try {
      const participant = await prisma.participant.findUnique({
        where: { id: parseInt(participantId, 10) },
        select: { id: true, cohort: { select: { provider: true } } },
      });

      if (participant?.cohort.provider) {
        provider = participant.cohort.provider as "anthropic" | "openai" | "gemini";
        const apiKey = await assignApiKey(participant.id, provider);
        if (apiKey) {
          const envKey = {
            anthropic: "ANTHROPIC_API_KEY",
            openai: "OPENAI_API_KEY",
            gemini: "GOOGLE_API_KEY",
          }[provider];
          if (envKey) {
            process.env[envKey] = apiKey;
          }
        }
      }
    } catch (err) {
      // Key pool not configured — fall back to env vars
      console.warn("Key pool error in chat config:", (err as Error).message);
    }
  }

  return {
    provider,
    conversationsDir: process.env.CONVERSATIONS_DIR || "data/conversations",
    traceDir: process.env.TRACE_DIR,
    debugStreams: !!process.env.DEBUG_STREAMS,
    apiBasePath: "/api",
  };
}
