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

  // Timer must be loaded AND expired. Before timer loads, everything stays disabled.
  const timerLoaded = remaining !== null;
  const timerExpired = timerLoaded && remaining <= 0;

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
        const isLast = currentStageIndex >= stages.length - 1;

        // Last stage for non-test users: logout and redirect
        if (isLast && !isTestUser) {
          await logout();
          window.location.href = "/";
          return;
        }

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

  const logout = async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
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

  // Auto-logout non-test users when study is completed
  const [loggedOut, setLoggedOut] = useState(false);
  useEffect(() => {
    if (completed && !isTestUser && !loggedOut) {
      logout().then(() => setLoggedOut(true));
    }
  }, [completed, isTestUser, loggedOut]);

  if (completed) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white">
        <div className="text-center space-y-4">
          <h1 className="text-4xl font-normal text-heading">Thank you!</h1>
          <p className="text-body">You have completed the study.</p>
          {isTestUser && (
            <>
              <button
                onClick={resetUser}
                className="mt-4 rounded-[5px] border border-red-300 px-6 py-2 text-sm text-red-600 hover:bg-red-50"
              >
                Reset this user
              </button>
              <button
                onClick={() => { logout().then(() => window.location.href = "/"); }}
                className="block mx-auto rounded-[5px] border border-gray-300 px-6 py-2 text-sm text-gray-600 hover:bg-gray-50"
              >
                Log out
              </button>
            </>
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
              className="w-full rounded-[5px] border border-input-border px-3 py-2 text-sm text-heading hover:bg-gray-100 active:bg-gray-200 transition-colors"
            >
              Next (skip timer)
            </button>
            <button
              onClick={() => { logout().then(() => window.location.href = "/"); }}
              className="w-full rounded-[5px] border border-gray-300 px-3 py-2 text-sm text-gray-500 hover:bg-gray-100 transition-colors"
            >
              Log out
            </button>
          </div>
        )}
      </aside>

      {/* Content area */}
      <main className="flex-1 p-12 overflow-y-auto">
        <h1 className="text-4xl font-normal text-heading mb-6">
          {currentStage?.title}
        </h1>

        {/* Chatbot button (at top if chatbot enabled but no placeholder in content) */}
        {Boolean(currentStage?.config?.chatbot) && !currentStage?.contentText?.includes("<AI_ASSISTANT_BUTTON>") && (
          <div className="mb-8">
            <button
              onClick={() => window.open("/chat", "_blank")}
              className="rounded-[5px] bg-btn-active-bg px-6 py-3 text-sm font-medium text-btn-active-text"
            >
              Open AI Assistant
            </button>
          </div>
        )}

        {/* Markdown content (with inline AI_ASSISTANT_BUTTON support) */}
        {currentStage?.contentText && (() => {
          const hasChatbot = Boolean(currentStage.config?.chatbot);
          const placeholder = "<AI_ASSISTANT_BUTTON>";
          const mdClasses = "max-w-none mb-8 text-sm text-body leading-relaxed [&_h1]:hidden [&_h2]:text-[22px] [&_h2]:font-normal [&_h2]:text-heading [&_h2]:mt-8 [&_h2]:mb-3 [&_h3]:text-[15px] [&_h3]:font-semibold [&_h3]:text-heading [&_h3]:mt-6 [&_h3]:mb-2 [&_p]:mb-3 [&_a]:text-blue-600 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:mb-3 [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:mb-3 [&_li]:mb-1 [&_strong]:font-semibold";

          if (hasChatbot && currentStage.contentText!.includes(placeholder)) {
            const parts = currentStage.contentText!.split(placeholder);
            return (
              <>
                {parts[0] && (
                  <div className={mdClasses}>
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{parts[0]}</ReactMarkdown>
                  </div>
                )}
                <div className="mb-8">
                  <button
                    onClick={() => window.open("/chat", "_blank")}
                    className="rounded-[5px] bg-btn-active-bg px-6 py-3 text-sm font-medium text-btn-active-text"
                  >
                    Open AI Assistant
                  </button>
                </div>
                {parts.slice(1).join("").trim() && (
                  <div className={mdClasses}>
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{parts.slice(1).join("")}</ReactMarkdown>
                  </div>
                )}
              </>
            );
          }

          return (
            <div className={mdClasses}>
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {currentStage.contentText!}
              </ReactMarkdown>
            </div>
          );
        })()}

        {/* Downloadable files */}
        {(currentStage?.config?.files as { filename: string; description: string }[] | undefined)?.length ? (
          <div className="mb-8">
            <h2 className="text-[22px] font-normal text-heading mb-3">Data</h2>
            <div className="space-y-2">
              {(currentStage.config.files as { filename: string; description: string }[]).map((f) => {
                const basename = f.filename.split("/").pop() ?? f.filename;
                return (
                  <div key={f.filename}>
                    <a
                      href={`/study-files/${basename}`}
                      download={basename}
                      className="text-blue-600 underline text-sm font-mono inline-flex items-center gap-1.5"
                    >
                      <svg className="w-4 h-4 shrink-0" viewBox="0 0 20 20" fill="currentColor"><path d="M14.5 11.5a.75.75 0 0 1 .75.75v3a1.75 1.75 0 0 1-1.75 1.75h-7A1.75 1.75 0 0 1 4.75 15.25v-3a.75.75 0 0 1 1.5 0v3a.25.25 0 0 0 .25.25h7a.25.25 0 0 0 .25-.25v-3a.75.75 0 0 1 .75-.75Z" /><path d="M10 3a.75.75 0 0 1 .75.75v6.69l1.72-1.72a.75.75 0 1 1 1.06 1.06l-3 3a.75.75 0 0 1-1.06 0l-3-3a.75.75 0 1 1 1.06-1.06l1.72 1.72V3.75A.75.75 0 0 1 10 3Z" /></svg>
                      {basename}
                    </a>
                    {f.description && (
                      <p className="text-sm text-body mt-0.5">{f.description}</p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}

        {/* External link */}
        {Boolean(currentStage?.config?.link) && (
          <div className="mb-8">
            <a
              href={(currentStage.config.link as { url: string }).url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 underline text-sm inline-flex items-center gap-1.5"
            >
              {(currentStage.config.link as { label: string }).label}
              <svg className="w-3.5 h-3.5 shrink-0" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4.25 5.5a.75.75 0 0 0-.75.75v8.5c0 .414.336.75.75.75h8.5a.75.75 0 0 0 .75-.75v-4a.75.75 0 0 1 1.5 0v4A2.25 2.25 0 0 1 12.75 17h-8.5A2.25 2.25 0 0 1 2 14.75v-8.5A2.25 2.25 0 0 1 4.25 4h5a.75.75 0 0 1 0 1.5h-5Zm10.22-1.97a.75.75 0 0 0-.53-.22H11a.75.75 0 0 1 0-1.5h4.25a.75.75 0 0 1 .75.75V7a.75.75 0 0 1-1.5 0V4.81l-5.72 5.72a.75.75 0 1 1-1.06-1.06l5.72-5.72H11.5Z" clipRule="evenodd" /></svg>
            </a>
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
        {Boolean(currentStage?.config?.input) && (
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
        {(() => {
          const hasInput = Boolean(currentStage?.config?.input);
          const isLast = currentStageIndex >= stages.length - 1;
          const buttonText = isLast
            ? (isTestUser ? "Complete study" : "Finish the study and log out")
            : hasInput
              ? "Submit your answer and proceed"
              : "Proceed";

          if (Boolean(currentStage?.config?.confirmation)) {
            return (
              <div className="mt-8 space-y-3">
                <label className={`flex items-start gap-2 text-sm ${timerExpired ? "text-body cursor-pointer" : "text-gray-400"}`}>
                  <input
                    type="checkbox"
                    className="mt-0.5"
                    checked={confirmed}
                    onChange={(e) => setConfirmed(e.target.checked)}
                    disabled={!timerExpired}
                  />
                  {currentStage!.config.confirmation as string}
                </label>
                <button
                  disabled={!timerExpired || !confirmed}
                  onClick={completeStage}
                  className={`rounded-[5px] px-6 py-3 text-sm ${
                    timerExpired && confirmed
                      ? "bg-btn-active-bg text-btn-active-text hover:opacity-90"
                      : "bg-btn-inactive-bg text-btn-inactive-text"
                  }`}
                >
                  {buttonText}
                </button>
              </div>
            );
          }

          return (
            <div className="mt-8">
              <button
                disabled={!timerExpired}
                onClick={completeStage}
                className={`rounded-[5px] px-6 py-3 text-sm ${
                  timerExpired
                    ? "bg-btn-active-bg text-btn-active-text font-medium hover:opacity-90"
                    : "bg-btn-inactive-bg text-btn-inactive-text"
                }`}
              >
                {buttonText}
              </button>
            </div>
          );
        })()}
      </main>
    </div>
  );
}
