import type { ChatRouteConfig } from "ucl-chat-widget/server";
import { cookies } from "next/headers";
import { assignApiKey } from "@/lib/key-pool";
import { prisma } from "@/lib/prisma";

/**
 * Build chat config per-request.
 *
 * Resolves the provider and API key from the participant's cohort
 * and the DB key pool. The apiKey is passed directly to the widget
 * config — no process.env mutation, no race conditions.
 *
 * Each participant gets their own conversationsDir so the widget's
 * singleton ConversationStore doesn't mix up providers between users.
 */
export async function getChatConfig(): Promise<ChatRouteConfig> {
  const cookieStore = await cookies();
  const participantId = cookieStore.get("participant_id")?.value;

  let provider: "anthropic" | "openai" | "gemini" = "anthropic";
  let apiKey: string | undefined;

  if (participantId) {
    try {
      const participant = await prisma.participant.findUnique({
        where: { id: parseInt(participantId, 10) },
        select: { id: true, cohort: { select: { provider: true } } },
      });

      if (participant?.cohort.provider) {
        provider = participant.cohort.provider as typeof provider;
        const key = await assignApiKey(participant.id, provider);
        if (key) {
          apiKey = key;
        }
      }
    } catch (err) {
      console.warn("Key pool error:", (err as Error).message);
    }
  }

  // Per-participant dir prevents the ConversationStore singleton from
  // mixing providers — each participant gets their own store instance
  const baseDir = process.env.CONVERSATIONS_DIR || "/tmp/conversations";
  const conversationsDir = participantId ? `${baseDir}/${participantId}` : baseDir;

  return {
    provider,
    apiKey,
    conversationsDir,
    apiBasePath: "/api",
  };
}
