import { redirect } from "next/navigation";
import { getParticipant } from "@/lib/auth";
import OpenChatButton from "@/components/OpenChatButton";

export default async function StudyPage() {
  const participant = await getParticipant();

  if (!participant) {
    redirect("/");
  }

  const stages = participant.cohort.stages;
  const progress = participant.progress;

  return (
    <div className="flex min-h-screen">
      {/* Schedule sidebar */}
      <aside className="w-[260px] bg-study-sidebar-bg border-r border-gray-200 p-6 shrink-0">
        <h2 className="text-lg font-normal text-heading mb-4">Schedule</h2>
        <div className="space-y-1.5">
          {stages.map((stage) => {
            const prog = progress.find((p) => p.stageId === stage.id);
            const isCompleted = !!prog?.completedAt;
            const isStarted = !!prog && !prog.completedAt;
            const minutes = Math.floor(stage.duration / 60);
            const durationStr = `${minutes} min`;

            return (
              <div key={stage.id} className="flex items-center gap-2">
                <span
                  className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                    isCompleted
                      ? "bg-study-muted"
                      : isStarted
                        ? "bg-btn-active-bg"
                        : "border-2 border-gray-400"
                  }`}
                />
                <span
                  className={`text-sm flex-1 ${
                    isCompleted ? "text-study-muted line-through" : "text-black"
                  }`}
                >
                  {stage.title}
                </span>
                <span className="text-sm text-gray-500 tabular-nums">
                  {durationStr}
                </span>
              </div>
            );
          })}
        </div>
      </aside>

      {/* Content area */}
      <main className="flex-1 p-12">
        <h1 className="text-4xl font-normal text-heading mb-4">
          {participant.session.study.title}
        </h1>
        <p className="text-body mb-6">
          {stages.length} stages in your study flow. Stage display coming next.
        </p>
        <OpenChatButton />
      </main>
    </div>
  );
}
