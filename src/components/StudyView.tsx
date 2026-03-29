"use client";

import { useState, useEffect, useCallback } from "react";

interface StageData {
  id: number;
  title: string;
  duration: number; // seconds
  config: Record<string, unknown>;
}

interface ProgressData {
  stageId: number;
  startedAt: string;
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

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export default function StudyView({
  stages,
  progress: initialProgress,
  studyTitle,
  cohortLabel,
  aiAccess,
  isTestUser,
}: Props) {
  const [progress, setProgress] = useState<ProgressData[]>(initialProgress);
  const [completed, setCompleted] = useState(false);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [confirmed, setConfirmed] = useState(false);

  // Re-fetch progress on mount (handles Cmd+Shift+T / tab restore)
  useEffect(() => {
    fetch("/api/auth/me")
      .then((res) => res.ok ? res.json() : null)
      .then((data) => {
        if (data?.progress) {
          setProgress(data.progress);
        }
      })
      .catch(() => {});
  }, []);

  // Determine current stage: first stage without completedAt
  const currentStageIndex = (() => {
    for (let i = 0; i < stages.length; i++) {
      const prog = progress.find((p) => p.stageId === stages[i].id);
      if (!prog || !prog.completedAt) return i;
    }
    return stages.length;
  })();

  useEffect(() => {
    if (currentStageIndex >= stages.length) setCompleted(true);
  }, [currentStageIndex, stages.length]);

  const currentStage = stages[currentStageIndex];

  // Start the current stage (record in DB)
  const startStage = useCallback(async (stageId: number) => {
    try {
      const res = await fetch("/api/participant/progress", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "start", stageId }),
      });
      if (res.ok) {
        const data = await res.json();
        setProgress((prev) => {
          const existing = prev.find((p) => p.stageId === stageId);
          if (existing) return prev;
          return [...prev, { stageId, startedAt: data.startedAt, completedAt: null }];
        });
      }
    } catch {}
  }, []);

  useEffect(() => {
    if (currentStage && !completed) {
      startStage(currentStage.id);
    }
  }, [currentStage?.id, completed, startStage]);

  // Timer
  useEffect(() => {
    if (!currentStage || completed) return;

    const prog = progress.find((p) => p.stageId === currentStage.id);
    if (!prog) return;

    const startedAt = new Date(prog.startedAt).getTime();
    const durationMs = currentStage.duration * 1000;

    const tick = () => {
      const elapsed = Date.now() - startedAt;
      const left = Math.max(0, Math.ceil((durationMs - elapsed) / 1000));
      setRemaining(left);
    };

    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [currentStage?.id, progress, completed]);

  useEffect(() => {
    setConfirmed(false);
  }, [currentStageIndex]);

  const timerExpired = remaining !== null && remaining <= 0;

  const completeStage = async () => {
    if (!currentStage) return;
    try {
      const res = await fetch("/api/participant/progress", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "complete", stageId: currentStage.id }),
      });
      if (res.ok) {
        const data = await res.json();
        setProgress((prev) =>
          prev.map((p) =>
            p.stageId === currentStage.id
              ? { ...p, completedAt: data.completedAt }
              : p
          )
        );
        setConfirmed(false);
      }
    } catch {}
  };

  if (completed) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white">
        <div className="text-center space-y-4">
          <h1 className="text-4xl font-normal text-heading">Thank you!</h1>
          <p className="text-body">You have completed the study.</p>
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
            const isCompleted = !!prog?.completedAt;
            const isCurrent = i === currentStageIndex;
            const minutes = Math.floor(stage.duration / 60);

            return (
              <div key={stage.id} className="flex items-center gap-2">
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
                    isCompleted ? "text-gray-400 line-through" : isCurrent ? "text-black font-medium" : "text-black"
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

        {/* Timer */}
        {remaining !== null && (
          <div className="border-t border-gray-200 pt-4 mt-4">
            <p className={`text-2xl font-mono tabular-nums text-center ${timerExpired ? "text-btn-active-bg" : "text-heading"}`}>
              {timerExpired ? "00:00" : formatTime(remaining)}
            </p>
            {timerExpired && (
              <p className="text-xs text-gray-500 text-center mt-1">Time&apos;s up!</p>
            )}
          </div>
        )}

        {/* Test user controls */}
        {isTestUser && (
          <div className="border-t border-gray-200 pt-4 mt-4 space-y-2">
            <p className="text-xs text-orange-600 uppercase tracking-wide font-medium">Testing</p>
            <button
              onClick={completeStage}
              className="w-full rounded-[5px] border border-input-border px-3 py-2 text-sm text-heading"
            >
              Next (skip timer)
            </button>
          </div>
        )}
      </aside>

      {/* Content area */}
      <main className="flex-1 p-12 overflow-y-auto">
        <h1 className="text-4xl font-normal text-heading mb-6">
          {currentStage?.title}
        </h1>

        <p className="text-body mb-6">
          Stage content will be rendered here.
        </p>

        {/* Chatbot button */}
        {aiAccess && currentStage?.config?.chatbot && (
          <div className="mb-8">
            <h2 className="text-[22px] font-normal text-heading mb-3">AI Chatbot</h2>
            <p className="text-sm text-body mb-3">Use the AI assistant to help with this task.</p>
            <button
              onClick={() => window.open("/chat", "_blank")}
              className="rounded-[5px] bg-btn-active-bg px-6 py-3 text-sm font-medium text-btn-active-text"
            >
              Open AI Assistant
            </button>
          </div>
        )}

        {/* Submit section — always visible, active only after timer */}
        {currentStage?.config?.confirmation && (
          <div className="mt-8 space-y-3">
            <label className={`flex items-start gap-2 text-sm cursor-pointer ${timerExpired ? "text-body" : "text-gray-400"}`}>
              <input
                type="checkbox"
                className="mt-0.5"
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
                disabled={!timerExpired}
              />
              {currentStage.config.confirmation as string}
            </label>
            <button
              disabled={!timerExpired || !confirmed}
              onClick={completeStage}
              className={`rounded-[5px] px-6 py-3 text-sm ${
                timerExpired && confirmed
                  ? "bg-btn-active-bg text-btn-active-text"
                  : "bg-btn-inactive-bg text-btn-inactive-text cursor-not-allowed"
              }`}
            >
              {currentStageIndex < stages.length - 1
                ? "Submit your answer and proceed"
                : "Complete study"}
            </button>
          </div>
        )}

        {/* No confirmation — just a proceed button */}
        {!currentStage?.config?.confirmation && (
          <div className="mt-8">
            <button
              disabled={!timerExpired}
              onClick={completeStage}
              className={`rounded-[5px] px-6 py-3 text-sm ${
                timerExpired
                  ? "bg-btn-active-bg text-btn-active-text font-medium"
                  : "bg-btn-inactive-bg text-btn-inactive-text cursor-not-allowed"
              }`}
            >
              {currentStageIndex < stages.length - 1
                ? "Proceed to next stage"
                : "Complete study"}
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
