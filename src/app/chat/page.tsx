import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import ChatPageClient from "./client";

export default async function ChatPage() {
  const cookieStore = await cookies();
  const pid = cookieStore.get("participant_id")?.value;

  if (!pid) {
    return (
      <div className="flex h-screen items-center justify-center bg-[var(--llmchat-background)] text-[var(--llmchat-foreground)]">
        <p>Please log in first.</p>
      </div>
    );
  }

  const participant = await prisma.participant.findUnique({
    where: { id: parseInt(pid, 10) },
    select: {
      cohort: {
        select: {
          stages: {
            select: { id: true, config: true },
            orderBy: { order: "asc" },
          },
        },
      },
      progress: {
        select: { stageId: true, completedAt: true },
      },
    },
  });

  // Check if currently on a chatbot stage (started, not completed)
  const onChatbotStage = participant?.cohort.stages.some((s) => {
    const prog = participant.progress.find((p) => p.stageId === s.id);
    const hasChatbot = (s.config as Record<string, unknown>)?.chatbot;
    return hasChatbot && prog && !prog.completedAt;
  });

  if (!onChatbotStage) {
    return (
      <div className="dark flex h-screen items-center justify-center bg-[var(--llmchat-background)] text-[var(--llmchat-foreground)]">
        <div className="text-center space-y-2">
          <p className="text-lg">Chat is not available for this stage.</p>
          <p className="text-sm text-gray-500">You can close this tab.</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <title>AI Assist</title>
      <ChatPageClient />
    </>
  );
}
