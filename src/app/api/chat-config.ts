import type { ChatRouteConfig } from "ucl-chat-widget/server";
import { cookies } from "next/headers";
import { assignApiKey } from "@/lib/key-pool";
import { prisma } from "@/lib/prisma";
import { DatabaseConversationBackend } from "@/lib/database-conversation-backend";

/**
 * Build chat config per-request.
 *
 * Determines the participant's current stage from DB progress
 * (started but not completed). Conversations are scoped to that stage.
 */
export async function getChatConfig(): Promise<ChatRouteConfig> {
  const cookieStore = await cookies();
  const participantId = cookieStore.get("participant_id")?.value;

  if (!participantId) {
    throw new Error("Not authenticated");
  }

  const pid = parseInt(participantId, 10);

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
              order: true,
              config: true,
              files: { select: { sha256: true, filename: true } },
            },
            orderBy: { order: "asc" },
          },
        },
      },
      progress: {
        select: { stageId: true, completedAt: true },
      },
    },
  });

  // Current stage: started but not completed, with chatbot enabled
  const currentChatStage = participant?.cohort.stages.find((s) => {
    const prog = participant.progress.find((p) => p.stageId === s.id);
    const hasChatbot = (s.config as Record<string, unknown>)?.chatbot;
    return hasChatbot && prog && !prog.completedAt;
  });

  // Provider resolution: stage config > cohort default
  const stageConfig = currentChatStage?.config as Record<string, unknown> | undefined;
  const provider = (
    (stageConfig?.provider as string) ||
    participant?.cohort.provider ||
    "anthropic"
  ) as "anthropic" | "openai" | "gemini";

  const stageId = currentChatStage?.id || 0;

  const stageFileHashes = new Map<string, string>();
  if (currentChatStage?.files) {
    for (const f of currentChatStage.files) {
      stageFileHashes.set(f.sha256, f.filename);
    }
  }

  let apiKey: string | undefined;
  try {
    const key = await assignApiKey(pid, provider);
    if (key) apiKey = key;
  } catch (err) {
    console.warn("Key pool error:", (err as Error).message);
  }

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
