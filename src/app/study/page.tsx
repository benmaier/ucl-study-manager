import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { getParticipant } from "@/lib/auth";
import StudyView from "@/components/StudyView";

export default async function StudyPage() {
  const participant = await getParticipant();

  if (!participant) {
    redirect("/");
  }

  const cookieStore = await cookies();
  const isTestUser = cookieStore.get("is_test_user")?.value === "true";

  const stages = participant.cohort.stages;
  const progress = participant.progress;

  return (
    <StudyView
      stages={stages.map((s) => ({
        id: s.id,
        title: s.title,
        duration: s.duration,
        contentText: s.contentText,
        config: s.config as Record<string, unknown>,
      }))}
      progress={progress.map((p) => ({
        stageId: p.stageId,
        startedAt: p.startedAt.toISOString(),
        completedAt: p.completedAt?.toISOString() ?? null,
      }))}
      studyTitle={participant.session.study.title}
      cohortLabel={participant.cohort.label}
      aiAccess={participant.cohort.aiAccess}
      isTestUser={isTestUser}
    />
  );
}
