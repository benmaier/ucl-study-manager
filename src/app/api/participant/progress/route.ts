import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";

/**
 * POST /api/participant/progress
 *
 * Actions:
 * - { action: "start", stageId } — record entering a stage (idempotent)
 * - { action: "complete", stageId, responses? } — record completing a stage
 */
export async function POST(request: NextRequest) {
  const cookieStore = await cookies();
  const pid = cookieStore.get("participant_id")?.value;
  if (!pid) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const participantId = parseInt(pid, 10);
  const body = await request.json();
  const { action, stageId, responses } = body as {
    action: "start" | "complete";
    stageId: number;
    responses?: Record<string, unknown>;
  };

  if (!action || !stageId) {
    return NextResponse.json({ error: "action and stageId required" }, { status: 400 });
  }

  if (action === "start") {
    // Upsert — idempotent, doesn't overwrite existing startedAt
    const progress = await prisma.participantProgress.upsert({
      where: {
        participantId_stageId: { participantId, stageId },
      },
      create: {
        participantId,
        stageId,
        startedAt: new Date(),
      },
      update: {}, // don't overwrite if already started
    });

    return NextResponse.json({
      stageId: progress.stageId,
      startedAt: progress.startedAt.toISOString(),
      completedAt: progress.completedAt?.toISOString() ?? null,
    });
  }

  if (action === "complete") {
    const progress = await prisma.participantProgress.upsert({
      where: {
        participantId_stageId: { participantId, stageId },
      },
      create: {
        participantId,
        stageId,
        startedAt: new Date(),
        completedAt: new Date(),
        responses: responses ?? undefined,
      },
      update: {
        completedAt: new Date(),
        responses: responses ?? undefined,
      },
    });

    return NextResponse.json({
      stageId: progress.stageId,
      startedAt: progress.startedAt.toISOString(),
      completedAt: progress.completedAt?.toISOString() ?? null,
    });
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}
