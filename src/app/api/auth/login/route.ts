import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { identifier, password } = body as { identifier?: string; password?: string };

  if (!identifier || !password) {
    return NextResponse.json({ error: "Identifier and password are required." }, { status: 400 });
  }

  const participant = await prisma.participant.findUnique({
    where: { identifier },
    include: {
      cohort: {
        include: {
          stages: { include: { files: true }, orderBy: { order: "asc" } },
        },
      },
      session: { include: { study: true } },
      progress: true,
    },
  });

  if (!participant) {
    return NextResponse.json({ error: "Identifier not found." }, { status: 404 });
  }

  if (!participant.dbPassword || !(await bcrypt.compare(password, participant.dbPassword))) {
    return NextResponse.json({ error: "Incorrect password." }, { status: 401 });
  }

  // Set session cookie
  const response = NextResponse.json({
    id: participant.id,
    identifier: participant.identifier,
    cohort: {
      id: participant.cohort.id,
      cohortId: participant.cohort.cohortId,
      label: participant.cohort.label,
      aiAccess: participant.cohort.aiAccess,
      stages: participant.cohort.stages.map((s) => ({
        id: s.id,
        stageId: s.stageId,
        title: s.title,
        duration: s.duration,
        order: s.order,
        contentText: s.contentText,
        config: s.config,
        files: s.files.map((f) => ({
          id: f.id,
          filename: f.filename,
          description: f.description,
        })),
      })),
    },
    study: {
      id: participant.session.study.id,
      title: participant.session.study.title,
    },
    progress: participant.progress.map((p) => ({
      stageId: p.stageId,
      startedAt: p.startedAt.toISOString(),
      completedAt: p.completedAt?.toISOString() ?? null,
      inputAnswer: p.inputAnswer,
    })),
  });

  response.cookies.set("participant_id", String(participant.id), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24, // 24 hours
  });

  return response;
}
