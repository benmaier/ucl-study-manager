import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/chat/status
 * Returns whether the participant is on a chatbot stage, which one,
 * and the sidebar panels for the chat widget.
 */
export async function GET() {
  const cookieStore = await cookies();
  const pid = cookieStore.get("participant_id")?.value;
  if (!pid) {
    return NextResponse.json({ available: false, stageId: null, sidebarPanels: [] });
  }

  const participant = await prisma.participant.findUnique({
    where: { id: parseInt(pid, 10) },
    select: {
      identifier: true,
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

  // Extract sidebar panels from stage config, replace <USER_ID>
  const config = currentChatStage?.config as Record<string, unknown> | undefined;
  const rawPanels = (config?.sidebarPanels ?? []) as Array<{
    title: string;
    content: string;
    defaultExpanded?: boolean;
  }>;

  const uid = participant?.identifier ?? "";
  const sidebarPanels = rawPanels.map((p) => ({
    title: p.title.replaceAll("<USER_ID>", uid),
    content: p.content.replaceAll("<USER_ID>", uid),
    defaultExpanded: p.defaultExpanded,
  }));

  return NextResponse.json({
    available: !!currentChatStage,
    stageId: currentChatStage?.id ?? null,
    sidebarPanels,
  });
}
