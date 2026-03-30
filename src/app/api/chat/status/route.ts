import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/chat/status
 * Returns whether the participant is currently on a chatbot-enabled stage.
 */
export async function GET() {
  const cookieStore = await cookies();
  const pid = cookieStore.get("participant_id")?.value;
  if (!pid) {
    return NextResponse.json({ available: false });
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

  const available = participant?.cohort.stages.some((s) => {
    const prog = participant.progress.find((p) => p.stageId === s.id);
    const hasChatbot = (s.config as Record<string, unknown>)?.chatbot;
    return hasChatbot && prog && !prog.completedAt;
  }) ?? false;

  return NextResponse.json({ available });
}
