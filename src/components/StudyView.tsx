"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface StageData {
  id: number;
  title: string;
  duration: number; // seconds
  contentText?: string | null;
  config: Record<string, unknown>;
}

interface ProgressData {
  stageId: number;
  startedAt: string;
  completedAt: string | null;
  responses?: Record<string, unknown> | null;
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
  const [inputValue, setInputValue] = useState("");
  const [saveStatus, setSaveStatus] = useState<"" | "saving" | "saved">("");
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  // Reset confirmed + load saved input on stage change
  useEffect(() => {
    setConfirmed(false);
    setSaveStatus("");
    // Load previously saved input for this stage
    if (currentStage) {
      const prog = progress.find((p) => p.stageId === currentStage.id);
      const saved = prog?.responses as Record<string, unknown> | null;
      setInputValue((saved?.inputAnswer as string) || "");
    }
  }, [currentStageIndex]);

  // Debounced auto-save (2 seconds after typing stops)
  const autoSave = useCallback((value: string) => {
    if (!currentStage) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      setSaveStatus("saving");
      try {
        await fetch("/api/participant/progress", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "save",
            stageId: currentStage.id,
            responses: { inputAnswer: value },
          }),
        });
        setSaveStatus("saved");
        setTimeout(() => setSaveStatus(""), 2000);
      } catch {
        setSaveStatus("");
      }
    }, 2000);
  }, [currentStage?.id]);

  const handleInputChange = (value: string) => {
    setInputValue(value);
    autoSave(value);
  };

  const timerExpired = remaining !== null && remaining <= 0;

  const completeStage = async () => {
    if (!currentStage) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    try {
      const responses: Record<string, unknown> = {};
      if (inputValue) responses.inputAnswer = inputValue;
      const res = await fetch("/api/participant/progress", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "complete", stageId: currentStage.id, responses }),
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

  const resetUser = async () => {
    if (!confirm("This will delete all your progress, chat history, and responses. Are you sure?")) return;
    try {
      const res = await fetch("/api/participant/reset", { method: "POST" });
      if (res.ok) {
        window.location.reload();
      }
    } catch {}
  };

  if (completed) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white">
        <div className="text-center space-y-4">
          <h1 className="text-4xl font-normal text-heading">Thank you!</h1>
          <p className="text-body">You have completed the study.</p>
          {isTestUser && (
            <button
              onClick={resetUser}
              className="mt-4 rounded-[5px] border border-red-300 px-6 py-2 text-sm text-red-600 hover:bg-red-50"
            >
              Reset this user
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

        {/* Markdown content */}
        {stages[currentStageIndex]?.contentText && (
          <div className="max-w-none mb-8 text-sm text-body leading-relaxed [&_h1]:hidden [&_h2]:text-[22px] [&_h2]:font-normal [&_h2]:text-heading [&_h2]:mt-8 [&_h2]:mb-3 [&_h3]:text-[15px] [&_h3]:font-semibold [&_h3]:text-heading [&_h3]:mt-6 [&_h3]:mb-2 [&_p]:mb-3 [&_a]:text-blue-600 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:mb-3 [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:mb-3 [&_li]:mb-1">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {stages[currentStageIndex].contentText!}
            </ReactMarkdown>
          </div>
        )}

        {/* External link */}
        {currentStage?.config?.link && (
          <div className="mb-8">
            <a
              href={(currentStage.config.link as { url: string }).url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 underline text-sm"
            >
              {(currentStage.config.link as { label: string }).label}
            </a>
          </div>
        )}

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

        {/* Questions */}
        {(currentStage?.config?.questions as string[] | undefined)?.length ? (
          <div className="mb-8">
            <h2 className="text-[22px] font-normal text-heading mb-3">Questions</h2>
            <ol className="list-decimal list-inside space-y-1 text-sm text-body">
              {(currentStage.config.questions as string[]).map((q, i) => (
                <li key={i}>{q}</li>
              ))}
            </ol>
          </div>
        ) : null}

        {/* Text input with auto-save */}
        {currentStage?.config?.input && (
          <div className="mb-8">
            {(currentStage.config.input as { prompt?: string }).prompt && (
              <p className="text-[15px] font-semibold text-heading mb-2">
                {(currentStage.config.input as { prompt: string }).prompt}
              </p>
            )}
            <textarea
              value={inputValue}
              onChange={(e) => handleInputChange(e.target.value)}
              placeholder={(currentStage.config.input as { label: string }).label}
              className="w-full max-w-[555px] h-[162px] rounded-[5px] border border-input-border px-3 py-2 text-sm text-body outline-none resize-none focus:ring-2 focus:ring-input-border"
            />
            <div className="h-5 mt-1">
              {saveStatus === "saving" && (
                <p className="text-xs text-gray-400">Saving...</p>
              )}
              {saveStatus === "saved" && (
                <p className="text-xs text-gray-400">Draft saved</p>
              )}
            </div>
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
