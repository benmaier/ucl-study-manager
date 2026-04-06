"use client";

import { useState, useEffect, useCallback } from "react";

interface CohortInfo {
  id: number;
  cohortId: string;
  label: string;
  provider: string | null;
  model: string | null;
  stageCount: number;
}

interface StudyInfo {
  id: number;
  studyId: string;
  title: string;
  cohorts: CohortInfo[];
  sessions: { id: number; label: string | null; createdAt: string }[];
}

export default function AdminPage() {
  const [authed, setAuthed] = useState(false);
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState("");

  // Studies data
  const [studies, setStudies] = useState<StudyInfo[]>([]);

  // Import study
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importStatus, setImportStatus] = useState("");
  const [importing, setImporting] = useState(false);
  const [previewing, setPreviewing] = useState(false);

  // CSV upload
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [csvStatus, setCsvStatus] = useState("");
  const [uploading, setUploading] = useState(false);

  // Generate test user
  const [selectedStudyId, setSelectedStudyId] = useState<number | null>(null);
  const [selectedCohortId, setSelectedCohortId] = useState("");
  const [generating, setGenerating] = useState(false);
  const [generatedCreds, setGeneratedCreds] = useState<{ username: string; password: string } | null>(null);

  const fetchStudies = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/list-studies", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      if (res.ok) {
        setStudies(await res.json());
      } else if (res.status === 401) {
        setAuthed(false);
      }
    } catch {}
  }, []);

  useEffect(() => {
    if (authed) fetchStudies();
  }, [authed, fetchStudies]);

  // Check if already authed on mount
  useEffect(() => {
    fetch("/api/admin/studies").then((res) => {
      if (res.ok) setAuthed(true);
    }).catch(() => {});
  }, []);

  const handleLogin = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setAuthError("");
    // Read from DOM directly — browser autofill may not trigger onChange
    const form = e.currentTarget;
    const inputValue = (form.elements.namedItem("admin-pass") as HTMLInputElement)?.value || password;
    if (!inputValue) {
      setAuthError("Please enter a password.");
      return;
    }
    const res = await fetch("/api/admin/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: inputValue }),
    });
    if (res.ok) {
      setAuthed(true);
      setPassword("");
    } else {
      setAuthError("Invalid password.");
    }
  };

  const handleImportStudy = async () => {
    if (!importFile) return;
    setImporting(true);
    setImportStatus("");
    try {
      const formData = new FormData();
      formData.append("file", importFile);
      const res = await fetch("/api/admin/import-study", { method: "POST", body: formData });
      const data = await res.json();
      if (res.ok) {
        setImportStatus(`Imported study "${data.title}" (ID: ${data.studyId}) with ${data.cohorts.length} cohorts.`);
        setImportFile(null);
        fetchStudies();
      } else {
        setImportStatus(`Error: ${data.error}`);
      }
    } catch {
      setImportStatus("Error: Failed to upload.");
    } finally {
      setImporting(false);
    }
  };

  const handlePreviewStudy = async () => {
    if (!importFile) return;
    setPreviewing(true);
    setImportStatus("");
    try {
      const formData = new FormData();
      formData.append("file", importFile);
      const res = await fetch("/api/admin/preview-study", { method: "POST", body: formData });
      const data = await res.json();
      if (res.ok) {
        sessionStorage.setItem("admin_preview_study", JSON.stringify(data));
        window.open("/admin/preview", "_blank");
      } else {
        setImportStatus(`Error: ${data.error}`);
      }
    } catch {
      setImportStatus("Error: Failed to upload.");
    } finally {
      setPreviewing(false);
    }
  };

  const handleUploadCsv = async () => {
    if (!csvFile) return;
    setUploading(true);
    setCsvStatus("");
    try {
      const formData = new FormData();
      formData.append("file", csvFile);
      const res = await fetch("/api/admin/upload-participants", { method: "POST", body: formData });
      const data = await res.json();
      if (res.ok) {
        let msg = `Created ${data.created} of ${data.total} participants.`;
        if (data.errors?.length) {
          msg += `\nErrors:\n${data.errors.join("\n")}`;
        }
        setCsvStatus(msg);
        setCsvFile(null);
      } else {
        setCsvStatus(`Error: ${data.error}`);
      }
    } catch {
      setCsvStatus("Error: Failed to upload.");
    } finally {
      setUploading(false);
    }
  };

  const handleGenerateTestUser = async () => {
    if (!selectedStudyId || !selectedCohortId) return;
    setGenerating(true);
    setGeneratedCreds(null);
    try {
      const res = await fetch("/api/admin/generate-test-user", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ studyId: selectedStudyId, cohortId: selectedCohortId }),
      });
      const data = await res.json();
      if (res.ok) {
        setGeneratedCreds({ username: data.username, password: data.password });
      } else {
        setGeneratedCreds(null);
        alert(data.error || "Failed to generate.");
      }
    } catch {
      alert("Error generating test user.");
    } finally {
      setGenerating(false);
    }
  };

  const handleLogout = () => {
    document.cookie = "admin_token=; path=/; max-age=0";
    setAuthed(false);
  };

  const selectedStudy = studies.find((s) => s.id === selectedStudyId);

  // ── Login screen ──
  if (!authed) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-white">
        <form onSubmit={handleLogin} className="w-full max-w-sm space-y-4 px-8">
          <h1 className="text-2xl font-normal text-heading text-center">Admin Panel</h1>
          <input
            type="password"
            name="admin-pass"
            defaultValue={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Admin password"
            className="w-full rounded-[5px] border border-input-border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-input-border"
            autoFocus
          />
          {authError && <p className="text-sm text-red-600 text-center">{authError}</p>}
          <button
            type="submit"
            className="w-full rounded-[5px] bg-btn-active-bg py-2.5 text-sm font-medium text-btn-active-text"
          >
            Sign in
          </button>
        </form>
      </main>
    );
  }

  // ── Admin panel ──
  return (
    <main className="min-h-screen bg-white p-8 max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-normal text-heading">Admin Panel</h1>
        <button onClick={handleLogout} className="text-sm text-gray-500 hover:text-heading">
          Log out
        </button>
      </div>

      {/* ── Import Study ── */}
      <section className="mb-8 rounded-lg border border-gray-200 p-6">
        <h2 className="text-lg font-medium text-heading mb-3">Import Study</h2>
        <p className="text-sm text-body mb-3">
          Upload a zip file containing the study directory (study.yaml + cohorts/ + content/ + files/).
          If a study with the same <code className="bg-gray-100 px-1 rounded text-xs">id</code> already exists, its metadata and cohorts will be updated.
          New cohorts are added, existing cohorts have their stages refreshed.
        </p>
        <div className="flex items-center gap-3">
          <label className="rounded-[5px] border border-input-border px-4 py-2 text-sm font-medium text-heading cursor-pointer hover:bg-gray-50 transition-colors">
            {importFile ? importFile.name : "Choose .zip file"}
            <input
              type="file"
              accept=".zip"
              onChange={(e) => setImportFile(e.target.files?.[0] ?? null)}
              className="hidden"
            />
          </label>
          <button
            onClick={handlePreviewStudy}
            disabled={!importFile || previewing || importing}
            className="rounded-[5px] border border-input-border px-4 py-2 text-sm font-medium text-heading disabled:opacity-40 hover:bg-gray-50 transition-colors"
          >
            {previewing ? "Validating..." : "Validate & Preview"}
          </button>
          <button
            onClick={handleImportStudy}
            disabled={!importFile || importing || previewing}
            className="rounded-[5px] bg-btn-active-bg px-4 py-2 text-sm font-medium text-btn-active-text disabled:bg-btn-inactive-bg disabled:text-btn-inactive-text"
          >
            {importing ? "Importing..." : "Import Study"}
          </button>
        </div>
        {importStatus && (
          <p className={`mt-3 text-sm whitespace-pre-wrap ${importStatus.startsWith("Error") ? "text-red-600" : "text-green-700"}`}>
            {importStatus}
          </p>
        )}
      </section>

      {/* ── Upload Participants CSV ── */}
      <section className="mb-8 rounded-lg border border-gray-200 p-6">
        <h2 className="text-lg font-medium text-heading mb-3">Upload Participants CSV</h2>
        <p className="text-sm text-body mb-1">
          Bulk-create participants from a CSV file. Passwords are hashed before storage.
        </p>
        <p className="text-sm text-body mb-1">
          CSV format: <code className="bg-gray-100 px-1 rounded text-xs">user,password,study_id,cohort_id</code>
        </p>
        <p className="text-sm text-gray-500 mb-3">
          <code className="bg-gray-100 px-1 rounded text-xs">study_id</code>{" "}is the study identifier from study.yaml (e.g. &quot;ai_decision_making&quot;).{" "}
          <code className="bg-gray-100 px-1 rounded text-xs">cohort_id</code>{" "}is the cohort identifier from the cohort YAML (e.g. &quot;gemini_trained&quot;).
          Rows with errors are skipped and reported — valid rows are still created.
        </p>
        <div className="flex items-center gap-3">
          <label className="rounded-[5px] border border-input-border px-4 py-2 text-sm font-medium text-heading cursor-pointer hover:bg-gray-50 transition-colors">
            {csvFile ? csvFile.name : "Choose .csv file"}
            <input
              type="file"
              accept=".csv"
              onChange={(e) => setCsvFile(e.target.files?.[0] ?? null)}
              className="hidden"
            />
          </label>
          <button
            onClick={handleUploadCsv}
            disabled={!csvFile || uploading}
            className="rounded-[5px] bg-btn-active-bg px-4 py-2 text-sm font-medium text-btn-active-text disabled:bg-btn-inactive-bg disabled:text-btn-inactive-text"
          >
            {uploading ? "Uploading..." : "Upload & Create"}
          </button>
        </div>
        {csvStatus && (
          <p className={`mt-3 text-sm whitespace-pre-wrap ${csvStatus.startsWith("Error") ? "text-red-600" : "text-green-700"}`}>
            {csvStatus}
          </p>
        )}
      </section>

      {/* ── Generate Test User ── */}
      <section className="mb-8 rounded-lg border border-gray-200 p-6">
        <h2 className="text-lg font-medium text-heading mb-3">Generate Test User</h2>
        <p className="text-sm text-body mb-3">
          Creates a single test user with a random 3-word username and 6-word password.
          Test users can skip stage timers and reset their progress — useful for verifying the study flow before running it with real participants.
        </p>
        <div className="flex items-center gap-3 flex-wrap">
          <select
            value={selectedStudyId ?? ""}
            onChange={(e) => {
              const id = e.target.value ? parseInt(e.target.value) : null;
              setSelectedStudyId(id);
              setSelectedCohortId("");
              setGeneratedCreds(null);
            }}
            className="rounded-[5px] border border-input-border px-3 py-2 text-sm outline-none"
          >
            <option value="">Select study...</option>
            {studies.map((s) => (
              <option key={s.id} value={s.id}>{s.title}</option>
            ))}
          </select>

          <select
            value={selectedCohortId}
            onChange={(e) => { setSelectedCohortId(e.target.value); setGeneratedCreds(null); }}
            disabled={!selectedStudyId}
            className="rounded-[5px] border border-input-border px-3 py-2 text-sm outline-none disabled:opacity-50"
          >
            <option value="">Select cohort...</option>
            {selectedStudy?.cohorts.map((c) => (
              <option key={c.cohortId} value={c.cohortId}>
                {c.label} ({c.stageCount} stages{c.provider ? `, ${c.provider}` : ""})
              </option>
            ))}
          </select>

          <button
            onClick={handleGenerateTestUser}
            disabled={!selectedStudyId || !selectedCohortId || generating}
            className="rounded-[5px] bg-btn-active-bg px-4 py-2 text-sm font-medium text-btn-active-text disabled:bg-btn-inactive-bg disabled:text-btn-inactive-text"
          >
            {generating ? "Generating..." : "Generate"}
          </button>
        </div>

        {generatedCreds && (
          <div className="mt-4 bg-gray-50 rounded-[5px] border border-gray-200 p-4 font-mono text-sm">
            <p><span className="text-gray-500">User:</span>  {generatedCreds.username}</p>
            <p><span className="text-gray-500">Pass:</span>  {generatedCreds.password}</p>
          </div>
        )}
      </section>

      {/* ── Studies & Cohorts ── */}
      <section className="rounded-lg border border-gray-200 p-6">
        <h2 className="text-lg font-medium text-heading mb-3">Studies & Cohorts</h2>
        {studies.length === 0 && <p className="text-sm text-gray-500">No studies imported yet.</p>}
        {studies.map((s) => (
          <div key={s.id} className="mb-4 last:mb-0">
            <p className="text-sm font-medium text-heading">
              {s.title} <span className="text-gray-400 font-normal">({s.studyId})</span>
            </p>
            <div className="ml-4 mt-1 space-y-0.5">
              {s.cohorts.map((c) => (
                <p key={c.cohortId} className="text-sm text-body">
                  {c.cohortId} — {c.label} ({c.stageCount} stages{c.provider ? `, ${c.provider} ${c.model}` : ""}){" "}
                  <a
                    href={`/admin/preview?studyId=${s.id}&cohortId=${c.cohortId}`}
                    target="_blank"
                    className="text-blue-600 hover:underline text-xs"
                  >
                    Preview
                  </a>
                </p>
              ))}
            </div>
            {s.sessions.length > 0 && (
              <p className="ml-4 mt-1 text-xs text-gray-400">
                Sessions: {s.sessions.map((ss) => ss.label || `#${ss.id}`).join(", ")}
              </p>
            )}
          </div>
        ))}
      </section>
    </main>
  );
}
