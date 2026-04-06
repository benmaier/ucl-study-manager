import { NextRequest, NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";

export async function POST(request: NextRequest) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({})) as Record<string, string>;
  const previewStudyId = body.preview;
  const previewCohortId = body.cohort;

  // DB-based preview: return full stage data for a single cohort
  if (previewStudyId && previewCohortId) {
    const study = await prisma.study.findUnique({
      where: { id: parseInt(previewStudyId, 10) },
      select: { id: true, studyId: true, title: true, description: true },
    });
    if (!study) {
      return NextResponse.json({ error: "Study not found" }, { status: 404 });
    }

    const cohort = await prisma.cohort.findFirst({
      where: { studyId: study.id, cohortId: previewCohortId },
      include: {
        stages: {
          include: { files: true },
          orderBy: { order: "asc" },
        },
      },
    });
    if (!cohort) {
      return NextResponse.json({ error: "Cohort not found" }, { status: 404 });
    }

    return NextResponse.json({
      studyId: study.studyId,
      title: study.title,
      description: study.description,
      sourceDir: "",
      cohorts: [{
        cohortId: cohort.cohortId,
        label: cohort.label,
        provider: cohort.provider,
        model: cohort.model,
        fallbackProvider: cohort.fallbackProvider,
        fallbackModel: cohort.fallbackModel,
        stages: cohort.stages.map((s) => {
          const config = (s.config as Record<string, unknown>) || {};
          return {
            stageId: s.stageId,
            title: s.title,
            durationSeconds: s.duration,
            order: s.order,
            contentRef: null,
            contentText: s.contentText,
            chatbot: config.chatbot ?? false,
            files: s.files.map((f) => ({
              filename: f.filename,
              description: f.description,
              sha256: f.sha256,
            })),
            questions: (config.questions as string[]) ?? [],
            input: config.input ?? null,
            link: config.link ?? null,
            confirmation: (config.confirmation as string) ?? null,
            sidebarPanels: (config.sidebarPanels as unknown[]) ?? [],
          };
        }),
      }],
    });
  }

  // Default: list all studies with summary data
  const studies = await prisma.study.findMany({
    include: {
      cohorts: {
        select: {
          id: true,
          cohortId: true,
          label: true,
          provider: true,
          model: true,
          stages: { select: { id: true }, orderBy: { order: "asc" } },
        },
        orderBy: { cohortId: "asc" },
      },
      sessions: {
        select: { id: true, label: true, createdAt: true },
        orderBy: { createdAt: "desc" },
      },
    },
    orderBy: { id: "desc" },
  });

  return NextResponse.json(
    studies.map((s) => ({
      id: s.id,
      studyId: s.studyId,
      title: s.title,
      cohorts: s.cohorts.map((c) => ({
        id: c.id,
        cohortId: c.cohortId,
        label: c.label,
        provider: c.provider,
        model: c.model,
        stageCount: c.stages.length,
      })),
      sessions: s.sessions.map((ss) => ({
        id: ss.id,
        label: ss.label,
        createdAt: ss.createdAt.toISOString(),
      })),
    }))
  );
}
