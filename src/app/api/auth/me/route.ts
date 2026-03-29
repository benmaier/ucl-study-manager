import { NextResponse } from "next/server";
import { getParticipant } from "@/lib/auth";

export async function GET() {
  const participant = await getParticipant();
  if (!participant) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  return NextResponse.json({
    progress: participant.progress.map((p) => ({
      stageId: p.stageId,
      startedAt: p.startedAt.toISOString(),
      completedAt: p.completedAt?.toISOString() ?? null,
    })),
  });
}
