import type { ChatRouteConfig } from "ucl-chat-widget/server";
import { cookies } from "next/headers";
import { assignApiKey } from "@/lib/key-pool";
import { prisma } from "@/lib/prisma";
import { DatabaseConversationBackend } from "@/lib/database-conversation-backend";

/**
 * Build chat config per-request.
 *
 * Creates a DatabaseConversationBackend scoped to the logged-in
 * participant. Conversations are stored in PostgreSQL, not the filesystem.
 * API keys are resolved from the DB key pool per-request.
 */
export async function getChatConfig(): Promise<ChatRouteConfig> {
  const cookieStore = await cookies();
  const participantId = cookieStore.get("participant_id")?.value;

  if (!participantId) {
    // No participant — return minimal config (will fail gracefully)
    return { provider: "anthropic", conversationsDir: "/tmp/conversations", apiBasePath: "/api" };
  }

  const pid = parseInt(participantId, 10);

  // Look up participant's cohort + stages for provider and file hashes
  const participant = await prisma.participant.findUnique({
    where: { id: pid },
    select: {
      id: true,
      cohort: {
        select: {
          provider: true,
          stages: {
            select: {
              id: true,
              config: true,
              files: { select: { sha256: true, filename: true } },
            },
          },
        },
      },
    },
  });

  const provider = (participant?.cohort.provider as "anthropic" | "openai" | "gemini") || "anthropic";

  // Find the first chatbot-enabled stage for this cohort
  const chatStage = participant?.cohort.stages.find(
    (s) => (s.config as Record<string, unknown>)?.chatbot
  );
  const stageId = chatStage?.id || 0;

  // Build file hash map for deduplication
  const stageFileHashes = new Map<string, string>();
  if (chatStage?.files) {
    for (const f of chatStage.files) {
      stageFileHashes.set(f.sha256, f.filename);
    }
  }

  // Resolve API key from DB key pool
  let apiKey: string | undefined;
  try {
    const key = await assignApiKey(pid, provider);
    if (key) apiKey = key;
  } catch (err) {
    console.warn("Key pool error:", (err as Error).message);
  }

  // Create DB-backed conversation backend
  const backend = new DatabaseConversationBackend(
    pid,
    stageId,
    provider,
    apiKey,
    stageFileHashes,
  );

  return {
    backend,
    apiBasePath: "/api",
  };
}
