import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/chat/status
 * Returns whether the participant is on a chatbot stage, and which one.
 */
export async function GET() {
  const cookieStore = await cookies();
  const pid = cookieStore.get("participant_id")?.value;
  if (!pid) {
    return NextResponse.json({ available: false, stageId: null });
  }

  const participant = await prisma.participant.findUnique({
    where: { id: parseInt(pid, 10) },
    select: {
      cohort: {
        select: {
          stages: { select: { id: true, config: true } },
        },
      },
      progress: { select: { stageId: true, completedAt: true } },
    },
  });

  const currentChatStage = participant?.cohort.stages.find((s) => {
    const prog = participant.progress.find((p) => p.stageId === s.id);
    const hasChatbot = (s.config as Record<string, unknown>)?.chatbot;
    return hasChatbot && prog && !prog.completedAt;
  });

  return NextResponse.json({
    available: !!currentChatStage,
    stageId: currentChatStage?.id ?? null,
  });
}
