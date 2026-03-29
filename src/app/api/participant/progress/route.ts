import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";

/**
 * POST /api/participant/progress
 *
 * Actions:
 * - { action: "start", stageId } — record entering a stage (idempotent)
 * - { action: "save", stageId, responses } — auto-save form data (debounced, not submitted)
 * - { action: "complete", stageId, responses? } — record completing a stage (submitted)
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
    action: "start" | "save" | "complete";
    stageId: number;
    responses?: Record<string, unknown>;
  };

  if (!action || !stageId) {
    return NextResponse.json({ error: "action and stageId required" }, { status: 400 });
  }

  if (action === "start") {
    const progress = await prisma.participantProgress.upsert({
      where: { participantId_stageId: { participantId, stageId } },
      create: { participantId, stageId, startedAt: new Date() },
      update: {},
    });

    return NextResponse.json({
      stageId: progress.stageId,
      startedAt: progress.startedAt.toISOString(),
      completedAt: progress.completedAt?.toISOString() ?? null,
      responses: progress.responses,
    });
  }

  if (action === "save") {
    // Auto-save: merge responses with submitted=false flag
    const existing = await prisma.participantProgress.findUnique({
      where: { participantId_stageId: { participantId, stageId } },
    });

    const merged = {
      ...((existing?.responses as Record<string, unknown>) || {}),
      ...responses,
      _submitted: false,
      _savedAt: new Date().toISOString(),
    };

    const progress = await prisma.participantProgress.upsert({
      where: { participantId_stageId: { participantId, stageId } },
      create: { participantId, stageId, startedAt: new Date(), responses: merged },
      update: { responses: merged },
    });

    return NextResponse.json({ ok: true, savedAt: merged._savedAt });
  }

  if (action === "complete") {
    const finalResponses = {
      ...(responses || {}),
      _submitted: true,
      _submittedAt: new Date().toISOString(),
    };

    const progress = await prisma.participantProgress.upsert({
      where: { participantId_stageId: { participantId, stageId } },
      create: {
        participantId, stageId, startedAt: new Date(),
        completedAt: new Date(), responses: finalResponses,
      },
      update: { completedAt: new Date(), responses: finalResponses },
    });

    return NextResponse.json({
      stageId: progress.stageId,
      startedAt: progress.startedAt.toISOString(),
      completedAt: progress.completedAt?.toISOString() ?? null,
    });
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}
