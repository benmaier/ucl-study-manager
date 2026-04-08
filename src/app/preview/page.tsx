"use client";

import { useState, useEffect } from "react";
import type { ParsedStudy, ParsedCohort, ParsedStage } from "@/lib/yaml-types";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export default function PreviewPage() {
  const [studyDir, setStudyDir] = useState("");
  const [study, setStudy] = useState<ParsedStudy | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedCohort, setSelectedCohort] = useState<ParsedCohort | null>(null);
  const [currentStageIndex, setCurrentStageIndex] = useState(0);
  const [confirmed, setConfirmed] = useState(false);

  async function loadStudy() {
    if (!studyDir.trim()) return;
    setError(null);
    setLoading(true);
    try {
      const res = await fetch(`/api/preview?dir=${encodeURIComponent(studyDir.trim())}`);
      const data = await res.json();
      if (!res.ok) {
        setError(data.error);
        return;
      }
      setStudy(data);
      setSelectedCohort(null);
      setCurrentStageIndex(0);
    } catch {
      setError("Failed to load study.");
    } finally {
      setLoading(false);
    }
  }

  // If study loaded but no cohort selected, show cohort picker
  if (study && !selectedCohort) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-white">
        <div className="w-full max-w-lg space-y-6 px-8">
          <h1 className="text-4xl font-normal text-heading text-center">{study.title}</h1>
          <p className="text-sm text-body text-center">Select a cohort to preview:</p>
          <div className="space-y-2">
            {study.cohorts.map((cohort) => (
              <button
                key={cohort.cohortId}
                onClick={() => { setSelectedCohort(cohort); setCurrentStageIndex(0); }}
                className="w-full rounded-[5px] border border-input-border px-4 py-3 text-left hover:bg-sidebar-bg transition-colors"
              >
                <span className="font-medium text-heading">{cohort.label}</span>
                <span className="text-sm text-gray-500 ml-2">
                  ({cohort.stages.length} stages{cohort.provider ? `, ${cohort.provider}` : ""})
                </span>
              </button>
            ))}
          </div>
          <button
            onClick={() => { setStudy(null); setStudyDir(""); }}
            className="w-full text-sm text-gray-500 hover:text-heading"
          >
            Load a different study
          </button>
        </div>
      </main>
    );
  }

  // Study view with admin nav
  if (study && selectedCohort) {
    const stages = selectedCohort.stages;
    const stage = stages[currentStageIndex];

    return (
      <div className="flex min-h-screen">
        {/* Schedule sidebar */}
        <aside className="w-[280px] bg-sidebar-bg border-r border-gray-200 p-6 shrink-0 flex flex-col">
          <h2 className="text-2xl font-normal text-heading mb-1">Schedule</h2>
          <p className="text-xs text-gray-500 mb-4">
            Preview: {selectedCohort.label}
          </p>
          <div className="space-y-2 flex-1">
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
            <p className="text-xs text-gray-500 uppercase tracking-wide">Admin</p>
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
              onClick={() => setSelectedCohort(null)}
              className="w-full text-xs text-gray-500 hover:text-heading"
            >
              Switch cohort
            </button>
          </div>
        </aside>

        {/* Content area */}
        <main className="flex-1 p-12 overflow-y-auto">
          <h1 className="text-4xl font-normal text-heading mb-6">{stage.title}</h1>

          {/* Markdown content */}
          {stage.contentText && (
            <div className="max-w-none mb-8 text-sm text-body leading-relaxed [&_h1]:hidden [&_h2]:text-[22px] [&_h2]:font-normal [&_h2]:text-heading [&_h2]:mt-8 [&_h2]:mb-3 [&_h3]:text-[15px] [&_h3]:font-semibold [&_h3]:text-heading [&_h3]:mt-6 [&_h3]:mb-2 [&_p]:mb-3 [&_a]:text-blue-600 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:mb-3 [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:mb-3 [&_li]:mb-1">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {stage.contentText}
              </ReactMarkdown>
            </div>
          )}

          {/* Files */}
          {stage.files.length > 0 && (
            <div className="mb-8">
              <h2 className="text-[22px] font-normal text-heading mb-3">Data</h2>
              <div className="space-y-2">
                {stage.files.map((f) => (
                  <div key={f.filename}>
                    <a
                      href={`/api/preview/files?dir=${encodeURIComponent(study.sourceDir)}&file=${encodeURIComponent(f.filename)}`}
                      className="text-blue-600 underline text-sm font-mono"
                      download
                    >
                      {f.filename.split("/").pop()}
                    </a>
                    {f.description && (
                      <p className="text-sm text-body mt-0.5">{f.description}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Chatbot */}
          {stage.chatbot && (
            <div className="mb-8">
              <button
                onClick={() => window.open("/chat", "_blank")}
                className="rounded-[5px] bg-btn-active-bg px-6 py-3 text-sm font-medium text-btn-active-text"
              >
                Open AI Assistant
              </button>
            </div>
          )}

          {/* Questions */}
          {stage.questions.length > 0 && (
            <div className="mb-8">
              <h2 className="text-[22px] font-normal text-heading mb-3">Submit your answer</h2>
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
                className="w-full max-w-[555px] h-[162px] rounded-[5px] border border-input-border px-3 py-2 text-sm text-body outline-none resize-none"
              />
            </div>
          )}

          {/* Confirmation + submit */}
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
                  } else {
                    alert("Study complete! In the real app, this would record completion and show a thank-you screen.");
                  }
                }}
                className={`rounded-[5px] px-6 py-3 text-sm ${
                  confirmed
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
        </main>
      </div>
    );
  }

  // Initial: enter study directory path
  return (
    <main className="flex min-h-screen items-center justify-center bg-white">
      <div className="w-full max-w-lg space-y-6 px-8">
        <h1 className="text-4xl font-normal text-heading text-center">
          Study Preview
        </h1>
        <p className="text-sm text-body text-center">
          Enter the path to a study directory to preview it.
        </p>
        <div>
          <input
            type="text"
            value={studyDir}
            onChange={(e) => setStudyDir(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && loadStudy()}
            placeholder="/path/to/studies/example"
            className="w-full rounded-[5px] border border-input-border px-3 py-2 text-sm text-body outline-none focus:ring-2 focus:ring-input-border font-mono"
            autoFocus
          />
        </div>
        {error && <p className="text-sm text-red-600 text-center">{error}</p>}
        <button
          onClick={loadStudy}
          disabled={loading || !studyDir.trim()}
          className="w-full rounded-[5px] bg-btn-active-bg py-3 text-sm font-medium text-btn-active-text disabled:bg-btn-inactive-bg disabled:text-btn-inactive-text"
        >
          {loading ? "Loading..." : "Load Study"}
        </button>
      </div>
    </main>
  );
}
