import { redirect } from "next/navigation";
import { getParticipant } from "@/lib/auth";

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
      <aside className="w-[362px] bg-sidebar-bg border-r border-gray-200 p-8 shrink-0">
        <h2 className="text-2xl font-normal text-heading mb-6">Schedule</h2>
        <div className="space-y-2">
          {stages.map((stage) => {
            const prog = progress.find((p) => p.stageId === stage.id);
            const isCompleted = !!prog?.completedAt;
            const isStarted = !!prog && !prog.completedAt;
            const minutes = Math.floor(stage.duration / 60);
            const seconds = stage.duration % 60;
            const durationStr = `${minutes} min`;

            return (
              <div key={stage.id} className="flex items-center gap-3">
                {/* Status indicator */}
                <span
                  className={`w-3 h-3 rounded-full shrink-0 ${
                    isCompleted
                      ? "bg-muted"
                      : isStarted
                        ? "bg-btn-active-bg"
                        : "border-2 border-gray-400"
                  }`}
                />
                {/* Stage name */}
                <span
                  className={`text-base flex-1 ${
                    isCompleted ? "text-muted line-through" : "text-black"
                  }`}
                >
                  {stage.title}
                </span>
                {/* Duration */}
                <span className="text-base text-muted tabular-nums">
                  {durationStr}
                </span>
              </div>
            );
          })}
        </div>
      </aside>

      {/* Content area */}
      <main className="flex-1 p-12">
        <p className="text-sm text-muted mb-2">
          Signed in as <span className="font-medium text-heading">{participant.identifier}</span>
          {" "}({participant.cohort.label})
        </p>
        <h1 className="text-4xl font-normal text-heading mb-4">
          {participant.session.study.title}
        </h1>
        <p className="text-body">
          {stages.length} stages in your study flow. Stage display coming next.
        </p>
      </main>
    </div>
  );
}
