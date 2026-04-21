"use client";

import { useState, useEffect } from "react";
import type { ParsedStudy, ParsedCohort, ParsedStage } from "@/lib/yaml-types";
import ReactMarkdown from "react-markdown";
import rehypeRaw from "rehype-raw";
import remarkGfm from "remark-gfm";

export default function AdminPreviewPage() {
  const [study, setStudy] = useState<ParsedStudy | null>(null);
  const [selectedCohort, setSelectedCohort] = useState<ParsedCohort | null>(null);
  const [currentStageIndex, setCurrentStageIndex] = useState(0);
  const [confirmed, setConfirmed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load study data from sessionStorage (zip preview) or from DB (query params)
  useEffect(() => {
    const stored = sessionStorage.getItem("admin_preview_study");
    if (stored) {
      try {
        const data = JSON.parse(stored) as ParsedStudy;
        setStudy(data);
        // Pre-select cohort if specified in URL
        const params = new URLSearchParams(window.location.search);
        const cohortId = params.get("cohort");
        if (cohortId) {
          const cohort = data.cohorts.find((c) => c.cohortId === cohortId);
          if (cohort) setSelectedCohort(cohort);
        }
      } catch {
        setError("Failed to load preview data.");
      }
      setLoading(false);
      return;
    }

    // DB-based preview: fetch from API
    const params = new URLSearchParams(window.location.search);
    const studyId = params.get("studyId");
    const cohortId = params.get("cohortId");
    if (studyId && cohortId) {
      fetch("/api/admin/list-studies", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ preview: studyId, cohort: cohortId }) })
        .then((res) => res.json())
        .then((data) => {
          if (data.error) {
            setError(data.error);
          } else {
            setStudy(data);
            if (data.cohorts?.length === 1) {
              setSelectedCohort(data.cohorts[0]);
            }
          }
        })
        .catch(() => setError("Failed to load study data."))
        .finally(() => setLoading(false));
      return;
    }

    setError("No preview data. Go back to the admin panel and use 'Validate & Preview'.");
    setLoading(false);
  }, []);

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-white">
        <p className="text-sm text-gray-500">Loading preview...</p>
      </main>
    );
  }

  if (error) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-white">
        <div className="text-center space-y-4">
          <p className="text-sm text-red-600">{error}</p>
          <button onClick={() => window.close()} className="text-sm text-blue-600 hover:underline">Close preview</button>
        </div>
      </main>
    );
  }

  // Cohort picker
  if (study && !selectedCohort) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-white">
        <div className="w-full max-w-lg space-y-6 px-8">
          <h1 className="text-2xl font-normal text-heading text-center">{study.title}</h1>
          <p className="text-sm text-body text-center">Select a cohort to preview:</p>
          <div className="space-y-2">
            {study.cohorts.map((cohort) => (
              <button
                key={cohort.cohortId}
                onClick={() => { setSelectedCohort(cohort); setCurrentStageIndex(0); setConfirmed(false); }}
                className="w-full rounded-[5px] border border-input-border px-4 py-3 text-left hover:bg-gray-50 transition-colors"
              >
                <span className="font-medium text-heading">{cohort.label}</span>
                <span className="text-sm text-gray-500 ml-2">
                  ({cohort.stages.length} stages{cohort.provider ? `, ${cohort.provider}` : ""})
                </span>
              </button>
            ))}
          </div>
          <button onClick={() => window.close()} className="block w-full text-center text-sm text-gray-500 hover:text-heading">
            Close preview
          </button>
        </div>
      </main>
    );
  }

  // Stage preview
  if (study && selectedCohort) {
    const stages = selectedCohort.stages;
    const stage = stages[currentStageIndex];
    const mdClasses = "max-w-none mb-8 text-sm text-body leading-relaxed [&_h1]:hidden [&_h2]:text-[22px] [&_h2]:font-normal [&_h2]:text-heading [&_h2]:mt-8 [&_h2]:mb-3 [&_h3]:text-[15px] [&_h3]:font-semibold [&_h3]:text-heading [&_h3]:mt-6 [&_h3]:mb-2 [&_p]:mb-3 [&_a]:text-blue-600 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:mb-3 [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:mb-3 [&_li]:mb-1 [&_strong]:font-semibold [&_iframe]:w-full [&_iframe]:max-w-full";

    return (
      <div className="flex min-h-screen">
        {/* Schedule sidebar */}
        <aside className="w-[280px] bg-sidebar-bg border-r border-gray-200 p-6 shrink-0 flex flex-col">
          <h2 className="text-2xl font-normal text-heading mb-1">Schedule</h2>
          <p className="text-xs text-gray-500 mb-4">
            Preview: {selectedCohort.label}
          </p>
          <div className="space-y-2 flex-1 overflow-y-auto">
            {stages.map((s, i) => {
              const isCurrent = i === currentStageIndex;
              const isPast = i < currentStageIndex;
              const minutes = Math.floor(s.durationSeconds / 60);

              return (
                <button
                  key={s.stageId}
                  onClick={() => { setCurrentStageIndex(i); setConfirmed(false); }}
                  className="flex items-center gap-3 w-full text-left hover:bg-white/50 rounded px-1 py-0.5 transition-colors"
                >
                  <span
                    className={`w-3 h-3 rounded-full shrink-0 ${
                      isPast ? "bg-gray-400" : isCurrent ? "bg-btn-active-bg" : "border-2 border-gray-400"
                    }`}
                  />
                  <span className={`text-sm flex-1 ${isPast ? "text-gray-500 line-through" : "text-black"}`}>
                    {s.title}
                  </span>
                  <span className="text-sm text-gray-500 tabular-nums">{minutes} min</span>
                </button>
              );
            })}
          </div>

          {/* Admin controls */}
          <div className="border-t border-gray-200 pt-4 mt-4 space-y-2">
            <div className="flex gap-2">
              <button
                onClick={() => { setCurrentStageIndex(Math.max(0, currentStageIndex - 1)); setConfirmed(false); }}
                disabled={currentStageIndex === 0}
                className="flex-1 rounded-[5px] border border-input-border px-3 py-2 text-sm text-heading disabled:opacity-30"
              >
                Previous
              </button>
              <button
                onClick={() => { setCurrentStageIndex(Math.min(stages.length - 1, currentStageIndex + 1)); setConfirmed(false); }}
                disabled={currentStageIndex === stages.length - 1}
                className="flex-1 rounded-[5px] border border-input-border px-3 py-2 text-sm text-heading disabled:opacity-30"
              >
                Next
              </button>
            </div>
            <button
              onClick={() => { setSelectedCohort(null); setCurrentStageIndex(0); }}
              className="w-full text-xs text-gray-500 hover:text-heading"
            >
              Switch cohort
            </button>
            <button
              onClick={() => window.close()}
              className="block w-full text-center text-xs text-gray-500 hover:text-heading"
            >
              Close preview
            </button>
          </div>
        </aside>

        {/* Content area */}
        <main className="flex-1 p-12 overflow-y-auto">
          {/* Stage badge */}
          <div className="flex items-center gap-3 mb-2">
            <span className="text-xs text-gray-400 font-mono">{stage.stageId}</span>
            <span className="text-xs text-gray-400">{Math.floor(stage.durationSeconds / 60)}:{String(stage.durationSeconds % 60).padStart(2, "0")}</span>
            {stage.chatbot && <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded">chatbot</span>}
          </div>

          <h1 className="text-4xl font-normal text-heading mb-6">{stage.title}</h1>

          {/* Chatbot button (at top if enabled but no placeholder in content) */}
          {stage.chatbot && !stage.contentText?.includes("<AI_ASSISTANT_BUTTON>") && (
            <div className="mb-8">
              <button className="rounded-[5px] bg-btn-active-bg px-6 py-3 text-sm font-medium text-btn-active-text opacity-60 cursor-default">
                Open AI Assistant (preview)
              </button>
            </div>
          )}

          {/* Markdown content */}
          {stage.contentText && (() => {
            const hasChatbot = stage.chatbot;
            const placeholder = "<AI_ASSISTANT_BUTTON>";

            if (hasChatbot && stage.contentText!.includes(placeholder)) {
              const parts = stage.contentText!.split(placeholder);
              return (
                <>
                  {parts[0] && (
                    <div className={mdClasses}>
                      <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]}>{parts[0]}</ReactMarkdown>
                    </div>
                  )}
                  <div className="mb-8">
                    <button className="rounded-[5px] bg-btn-active-bg px-6 py-3 text-sm font-medium text-btn-active-text opacity-60 cursor-default">
                      Open AI Assistant (preview)
                    </button>
                  </div>
                  {parts.slice(1).join("").trim() && (
                    <div className={mdClasses}>
                      <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]}>{parts.slice(1).join("")}</ReactMarkdown>
                    </div>
                  )}
                </>
              );
            }

            return (
              <div className={mdClasses}>
                <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]}>{stage.contentText!}</ReactMarkdown>
              </div>
            );
          })()}

          {/* Files */}
          {stage.files.length > 0 && (
            <div className="mb-8">
              <h2 className="text-[22px] font-normal text-heading mb-3">Data</h2>
              <div className="space-y-2">
                {stage.files.map((f) => (
                  <div key={f.filename}>
                    <span className="text-blue-600 text-sm font-mono inline-flex items-center gap-1.5">
                      <svg className="w-4 h-4 shrink-0" viewBox="0 0 20 20" fill="currentColor"><path d="M14.5 11.5a.75.75 0 0 1 .75.75v3a1.75 1.75 0 0 1-1.75 1.75h-7A1.75 1.75 0 0 1 4.75 15.25v-3a.75.75 0 0 1 1.5 0v3a.25.25 0 0 0 .25.25h7a.25.25 0 0 0 .25-.25v-3a.75.75 0 0 1 .75-.75Z" /><path d="M10 3a.75.75 0 0 1 .75.75v6.69l1.72-1.72a.75.75 0 1 1 1.06 1.06l-3 3a.75.75 0 0 1-1.06 0l-3-3a.75.75 0 1 1 1.06-1.06l1.72 1.72V3.75A.75.75 0 0 1 10 3Z" /></svg>
                      {f.filename.split("/").pop()}
                    </span>
                    {f.description && <p className="text-sm text-body mt-0.5">{f.description}</p>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Questions */}
          {stage.questions.length > 0 && (
            <div className="mb-8">
              <h2 className="text-[22px] font-normal text-heading mb-3">Questions</h2>
              <ol className="list-decimal list-inside space-y-1 text-sm text-body">
                {stage.questions.map((q, i) => (
                  <li key={i}>{q}</li>
                ))}
              </ol>
            </div>
          )}

          {/* Input field */}
          {stage.input && (
            <div className="mb-8">
              {stage.input.prompt && (
                <p className="text-[15px] font-semibold text-heading mb-2">{stage.input.prompt}</p>
              )}
              <textarea
                placeholder={stage.input.label}
                disabled
                className="w-full max-w-[555px] h-[100px] rounded-[5px] border border-input-border px-3 py-2 text-sm text-body outline-none resize-none opacity-50"
              />
            </div>
          )}

          {/* Sidebar panels info */}
          {stage.sidebarPanels.length > 0 && (
            <div className="mb-8 bg-gray-50 rounded-[5px] border border-gray-200 p-4">
              <p className="text-xs text-gray-500 uppercase tracking-wide mb-2">Chat sidebar panels</p>
              {stage.sidebarPanels.map((p, i) => (
                <div key={i} className="mb-2 last:mb-0">
                  <p className="text-sm font-medium text-heading">{p.title}</p>
                  <p className="text-sm text-body">{p.content}</p>
                </div>
              ))}
            </div>
          )}

          {/* Completion code (preview only shows the field — doesn't enforce in admin preview) */}
          {stage.codeToProgress && (
            <div className="mb-4 space-y-1">
              <label className="block text-sm font-medium text-heading">Completion code</label>
              <input
                type="text"
                disabled
                placeholder={`Participants must enter: ${stage.codeToProgress}`}
                className="w-full max-w-xs rounded-[5px] border border-input-border px-3 py-2 text-sm text-gray-500 bg-gray-50 italic"
              />
              <p className="text-xs text-gray-400">
                In the participant view, submit is blocked until this code is entered.
              </p>
            </div>
          )}

          {/* Confirmation */}
          {stage.confirmation && (
            <div className="mb-8 space-y-3">
              <label className="flex items-start gap-2 text-sm text-body cursor-pointer">
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={confirmed}
                  onChange={(e) => setConfirmed(e.target.checked)}
                />
                {stage.confirmation}
              </label>
              <button
                disabled={!confirmed}
                onClick={() => {
                  if (currentStageIndex < stages.length - 1) {
                    setCurrentStageIndex(currentStageIndex + 1);
                    setConfirmed(false);
                  }
                }}
                className={`rounded-[5px] px-6 py-3 text-sm ${
                  confirmed
                    ? "bg-btn-active-bg text-btn-active-text"
                    : "bg-btn-inactive-bg text-btn-inactive-text"
                }`}
              >
                {currentStageIndex < stages.length - 1
                  ? stage.input ? "Submit your answer and proceed" : "Proceed"
                  : "Complete study"}
              </button>
            </div>
          )}
        </main>
      </div>
    );
  }

  return null;
}
