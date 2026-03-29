"use client";

import { useState } from "react";

interface StageData {
  id: number;
  title: string;
  duration: number;
  config: Record<string, unknown>;
}

interface ProgressData {
  stageId: number;
  completedAt: string | null;
}

interface Props {
  stages: StageData[];
  progress: ProgressData[];
  studyTitle: string;
  cohortLabel: string;
  aiAccess: boolean;
  isTestUser: boolean;
}

export default function StudyView({
  stages,
  progress,
  studyTitle,
  cohortLabel,
  aiAccess,
  isTestUser,
}: Props) {
  // For test users, track current stage locally
  const [currentStageIndex, setCurrentStageIndex] = useState(0);
  const [completed, setCompleted] = useState(false);

  if (completed) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white">
        <div className="text-center space-y-4">
          <h1 className="text-4xl font-normal text-heading">Thank you!</h1>
          <p className="text-body">You have completed the study.</p>
          {isTestUser && (
            <button
              onClick={() => { setCompleted(false); setCurrentStageIndex(0); }}
              className="text-sm text-gray-500 hover:text-heading underline"
            >
              Restart (test mode)
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen">
      {/* Schedule sidebar */}
      <aside className="w-[260px] bg-study-sidebar-bg border-r border-gray-200 p-6 shrink-0 flex flex-col">
        <h2 className="text-lg font-normal text-heading mb-4">Schedule</h2>
        <div className="space-y-1.5 flex-1">
          {stages.map((stage, i) => {
            const prog = progress.find((p) => p.stageId === stage.id);
            const isCompleted = isTestUser ? i < currentStageIndex : !!prog?.completedAt;
            const isCurrent = isTestUser ? i === currentStageIndex : (!prog?.completedAt && !!prog);
            const minutes = Math.floor(stage.duration / 60);

            return (
              <div
                key={stage.id}
                className={`flex items-center gap-2 ${isTestUser ? "cursor-pointer hover:bg-white/50 rounded px-1 py-0.5" : ""}`}
                onClick={isTestUser ? () => setCurrentStageIndex(i) : undefined}
              >
                <span
                  className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                    isCompleted
                      ? "bg-gray-400"
                      : isCurrent
                        ? "bg-btn-active-bg"
                        : "border-2 border-gray-400"
                  }`}
                />
                <span
                  className={`text-sm flex-1 ${
                    isCompleted ? "text-gray-400 line-through" : "text-black"
                  }`}
                >
                  {stage.title}
                </span>
                <span className="text-sm text-gray-500 tabular-nums">
                  {minutes} min
                </span>
              </div>
            );
          })}
        </div>

        {/* Test user controls */}
        {isTestUser && (
          <div className="border-t border-gray-200 pt-4 mt-4 space-y-2">
            <p className="text-xs text-orange-600 uppercase tracking-wide font-medium">Testing</p>
            <button
              onClick={() => {
                if (currentStageIndex < stages.length - 1) {
                  setCurrentStageIndex(currentStageIndex + 1);
                } else {
                  setCompleted(true);
                }
              }}
              className="w-full rounded-[5px] border border-input-border px-3 py-2 text-sm text-heading"
            >
              Next
            </button>
          </div>
        )}
      </aside>

      {/* Content area */}
      <main className="flex-1 p-12">
        <h1 className="text-4xl font-normal text-heading mb-4">
          {studyTitle}
        </h1>
        <p className="text-body mb-6">
          Stage: {stages[isTestUser ? currentStageIndex : 0]?.title}
        </p>
        {aiAccess && stages[isTestUser ? currentStageIndex : 0]?.config?.chatbot && (
          <button
            onClick={() => window.open("/chat", "_blank")}
            className="rounded-[5px] bg-btn-active-bg px-6 py-3 text-sm font-medium text-btn-active-text"
          >
            Open AI Assistant
          </button>
        )}
      </main>
    </div>
  );
}
