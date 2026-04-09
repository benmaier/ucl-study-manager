"use client";

import { useState, useEffect, useCallback } from "react";
import JSZip from "jszip";

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
  isHidden: boolean;
  cohorts: CohortInfo[];
  sessions: { id: number; label: string | null; createdAt: string }[];
}

export default function AdminPage() {
  const [authed, setAuthed] = useState(false);
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState("");

  // Studies data
  const [studies, setStudies] = useState<StudyInfo[]>([]);

  // Import study — state machine: idle → validating → validated → confirming → importing → done | error
  const [importState, setImportState] = useState<"idle" | "validating" | "validated" | "confirming" | "importing" | "done" | "error">("idle");
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importError, setImportError] = useState("");
  const [importResult, setImportResult] = useState("");
  const [parsedStudy, setParsedStudy] = useState<{ studyId: string; title: string; description: string | null; cohorts: { cohortId: string; label: string; stages: { stageId: string }[] }[] } | null>(null);
  const [dragOver, setDragOver] = useState(false);

  // CSV upload — state machine: idle → validating → validated → uploading → done | error
  const [csvState, setCsvState] = useState<"idle" | "validating" | "validated" | "uploading" | "done" | "error">("idle");
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [csvError, setCsvError] = useState("");
  const [csvResult, setCsvResult] = useState("");
  const [csvDragOver, setCsvDragOver] = useState(false);
  const [csvRows, setCsvRows] = useState<{ row: number; user: string; studyId: string; cohortId: string; status: string; message: string }[]>([]);

  // API keys
  const [apiKeys, setApiKeys] = useState<{ id: number; provider: string; label: string; key_preview: string; session_assignment_count: number; is_active: boolean }[]>([]);
  const [newKeyProvider, setNewKeyProvider] = useState("anthropic");
  const [newKeyValue, setNewKeyValue] = useState("");
  const [addingKey, setAddingKey] = useState(false);

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

  const fetchApiKeys = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/api-keys", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "list" }) });
      if (res.ok) {
        const data = await res.json();
        setApiKeys(data.keys || []);
      }
    } catch {}
  }, []);

  useEffect(() => {
    if (authed) { fetchStudies(); fetchApiKeys(); }
  }, [authed, fetchStudies, fetchApiKeys]);

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

  const validateFile = async (file: File) => {
    setImportFile(file);
    setImportState("validating");
    setImportError("");
    setParsedStudy(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/admin/preview-study", { method: "POST", body: formData });
      const data = await res.json();
      if (res.ok) {
        setParsedStudy(data);
        setImportState("validated");
      } else {
        setImportError(data.error || "Validation failed.");
        setImportState("error");
      }
    } catch {
      setImportError("Failed to upload file.");
      setImportState("error");
    }
  };

  const handleImportStudy = async () => {
    if (!importFile) return;
    setImportState("importing");
    try {
      const formData = new FormData();
      formData.append("file", importFile);
      const res = await fetch("/api/admin/import-study", { method: "POST", body: formData });
      const data = await res.json();
      if (res.ok) {
        setImportResult(`Imported "${data.title}" with ${data.cohorts.length} cohorts.`);
        setImportState("done");
        setImportFile(null);
        setParsedStudy(null);
        fetchStudies();
      } else {
        setImportError(data.error || "Import failed.");
        setImportState("error");
      }
    } catch {
      setImportError("Failed to upload file.");
      setImportState("error");
    }
  };

  const handlePreviewStudy = () => {
    if (!parsedStudy) return;
    sessionStorage.setItem("admin_preview_study", JSON.stringify(parsedStudy));
    window.open("/admin/preview", "_blank");
  };

  const resetImport = () => {
    setImportState("idle");
    setImportFile(null);
    setParsedStudy(null);
    setImportError("");
    setImportResult("");
  };

  const handleFileDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);

    // Check for a .zip file first
    const zipFile = Array.from(e.dataTransfer.files).find((f) => f.name.endsWith(".zip"));
    if (zipFile) {
      validateFile(zipFile);
      return;
    }

    // Check for a dropped folder (beta)
    const items = Array.from(e.dataTransfer.items);
    const entries = items
      .map((item) => item.webkitGetAsEntry?.())
      .filter((entry): entry is FileSystemEntry => !!entry);
    const dirEntry = entries.find((entry) => entry.isDirectory);

    if (dirEntry) {
      setImportState("validating");
      setImportError("");
      try {
        const zip = new JSZip();
        await addEntryToZip(zip, dirEntry, "");
        const blob = await zip.generateAsync({ type: "blob" });
        const file = new File([blob], `${dirEntry.name}.zip`, { type: "application/zip" });
        validateFile(file);
      } catch {
        setImportError("Failed to read folder contents.");
        setImportState("error");
      }
    }
  };

  // Recursively read a dropped directory into a JSZip instance
  async function addEntryToZip(zip: JSZip, entry: FileSystemEntry, path: string): Promise<void> {
    if (entry.isFile) {
      const fileEntry = entry as FileSystemFileEntry;
      const file = await new Promise<File>((resolve, reject) => fileEntry.file(resolve, reject));
      zip.file(path + entry.name, file);
    } else if (entry.isDirectory) {
      const dirEntry = entry as FileSystemDirectoryEntry;
      const reader = dirEntry.createReader();
      const entries = await new Promise<FileSystemEntry[]>((resolve, reject) => reader.readEntries(resolve, reject));
      for (const child of entries) {
        await addEntryToZip(zip, child, path + entry.name + "/");
      }
    }
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) validateFile(file);
  };

  // Compute diff for existing studies
  const existingStudy = parsedStudy ? studies.find((s) => s.studyId === parsedStudy.studyId) : null;
  const isUpdate = !!existingStudy;

  const validateCsv = async (file: File) => {
    setCsvFile(file);
    setCsvState("validating");
    setCsvError("");
    setCsvRows([]);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/admin/validate-participants", { method: "POST", body: formData });
      const data = await res.json();
      if (res.ok) {
        setCsvRows(data.results);
        setCsvState("validated");
      } else {
        setCsvError(data.error || "Validation failed.");
        setCsvState("error");
      }
    } catch {
      setCsvError("Failed to upload file.");
      setCsvState("error");
    }
  };

  const handleUploadCsv = async () => {
    if (!csvFile) return;
    setCsvState("uploading");
    try {
      const formData = new FormData();
      formData.append("file", csvFile);
      const res = await fetch("/api/admin/upload-participants", { method: "POST", body: formData });
      const data = await res.json();
      if (res.ok) {
        const parts = [];
        if (data.created) parts.push(`${data.created} created`);
        if (data.updated) parts.push(`${data.updated} password updated`);
        if (data.reassigned) parts.push(`${data.reassigned} reassigned`);
        if (data.errors?.length) parts.push(`${data.errors.length} errors`);
        setCsvResult(parts.join(", ") || "No changes.");
        setCsvState("done");
        setCsvFile(null);
        setCsvRows([]);
      } else {
        setCsvError(data.error || "Upload failed.");
        setCsvState("error");
      }
    } catch {
      setCsvError("Failed to upload file.");
      setCsvState("error");
    }
  };

  const resetCsv = () => {
    setCsvState("idle");
    setCsvFile(null);
    setCsvRows([]);
    setCsvError("");
    setCsvResult("");
  };

  const handleCsvDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setCsvDragOver(false);
    const file = Array.from(e.dataTransfer.files).find((f) => f.name.endsWith(".csv"));
    if (file) validateCsv(file);
  };

  const handleCsvSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) validateCsv(file);
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
          Upload a zip containing the study directory (<code className="bg-gray-100 px-1 rounded text-xs">study.yaml</code> + <code className="bg-gray-100 px-1 rounded text-xs">cohorts/</code> + <code className="bg-gray-100 px-1 rounded text-xs">content/</code> + <code className="bg-gray-100 px-1 rounded text-xs">files/</code>).
          The file will be validated automatically. If a study with the same ID already exists, you&apos;ll see a diff before confirming the update.
        </p>

        {/* Drop zone / idle state */}
        {(importState === "idle" || importState === "error" || importState === "done") && (
          <>
            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleFileDrop}
              className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors cursor-pointer ${
                dragOver ? "border-btn-active-bg bg-green-50" : "border-gray-300 hover:border-gray-400"
              }`}
              onClick={() => document.getElementById("import-file-input")?.click()}
            >
              <p className="text-sm text-gray-500">
                Drop a <code className="bg-gray-100 px-1 rounded text-xs">.zip</code> file or study folder here, or click to browse
              </p>
              <p className="text-xs text-gray-400 mt-1">study.yaml + cohorts/ + content/ + files/</p>
              <input
                id="import-file-input"
                type="file"
                accept=".zip"
                onChange={handleFileSelect}
                className="hidden"
              />
            </div>
            {importState === "error" && (
              <p className="mt-3 text-sm text-red-600 whitespace-pre-wrap">{importError}</p>
            )}
            {importState === "done" && (
              <p className="mt-3 text-sm text-green-700">{importResult}</p>
            )}
          </>
        )}

        {/* Validating */}
        {importState === "validating" && (
          <div className="py-6 text-center">
            <p className="text-sm text-gray-500">Validating {importFile?.name}...</p>
          </div>
        )}

        {/* Validated — show summary + diff */}
        {importState === "validated" && parsedStudy && (
          <div className="space-y-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm font-medium text-heading">
                  {isUpdate ? "Update existing study" : "New study"}:{" "}
                  &ldquo;{parsedStudy.title}&rdquo;
                </p>
                <p className="text-xs text-gray-500 mt-0.5">
                  <code className="font-mono bg-gray-100 px-1 rounded">{parsedStudy.studyId}</code>
                  {" "}&middot; {parsedStudy.cohorts.length} cohorts &middot; from {importFile?.name}
                </p>
              </div>
              <button onClick={resetImport} className="text-xs text-gray-400 hover:text-heading">&times; Clear</button>
            </div>

            {/* Cohort summary / diff */}
            <div className="bg-gray-50 rounded-[5px] border border-gray-200 p-4 text-sm space-y-1">
              {parsedStudy.cohorts.map((c) => {
                const existingCohort = existingStudy?.cohorts.find((ec) => ec.cohortId === c.cohortId);
                const isNew = isUpdate && !existingCohort;
                const stageCountChanged = existingCohort && existingCohort.stageCount !== c.stages.length;
                return (
                  <div key={c.cohortId} className="flex items-center gap-2">
                    {isNew && <span className="text-green-600 text-xs font-medium">+ new</span>}
                    {stageCountChanged && <span className="text-amber-600 text-xs font-medium">~ changed</span>}
                    {existingCohort && !stageCountChanged && <span className="text-gray-400 text-xs">unchanged</span>}
                    {!isUpdate && <span className="text-gray-400 text-xs">&bull;</span>}
                    <code className="font-mono text-xs bg-white px-1 rounded">{c.cohortId}</code>
                    <span className="text-body">{c.label}</span>
                    <span className="text-gray-400">
                      ({c.stages.length} stages{stageCountChanged ? `, was ${existingCohort!.stageCount}` : ""})
                    </span>
                  </div>
                );
              })}
              {/* Cohorts in DB but not in the uploaded study */}
              {isUpdate && existingStudy!.cohorts
                .filter((ec) => !parsedStudy.cohorts.find((c) => c.cohortId === ec.cohortId))
                .map((ec) => (
                  <div key={ec.cohortId} className="flex items-center gap-2 opacity-50">
                    <span className="text-gray-400 text-xs">kept</span>
                    <code className="font-mono text-xs bg-white px-1 rounded">{ec.cohortId}</code>
                    <span className="text-body">{ec.label}</span>
                    <span className="text-gray-400">(not in upload, won&apos;t be deleted)</span>
                  </div>
                ))}
            </div>

            {/* Action buttons */}
            <div className="flex items-center gap-3">
              <button
                onClick={handlePreviewStudy}
                className="rounded-[5px] border border-input-border px-4 py-2 text-sm font-medium text-heading hover:bg-gray-50 transition-colors"
              >
                Preview
              </button>
              <button
                onClick={() => isUpdate ? setImportState("confirming") : handleImportStudy()}
                className="rounded-[5px] bg-btn-active-bg px-4 py-2 text-sm font-medium text-btn-active-text"
              >
                {isUpdate ? "Update Study" : "Import Study"}
              </button>
            </div>
          </div>
        )}

        {/* Confirmation step for updates */}
        {importState === "confirming" && parsedStudy && (
          <div className="space-y-4">
            <div className="bg-amber-50 border border-amber-200 rounded-[5px] p-4">
              <p className="text-sm text-amber-800 font-medium">Are you sure?</p>
              <p className="text-sm text-amber-700 mt-1">
                {(() => {
                  const newCount = parsedStudy.cohorts.filter((c) => !existingStudy?.cohorts.find((ec) => ec.cohortId === c.cohortId)).length;
                  const changedCount = parsedStudy.cohorts.filter((c) => {
                    const ec = existingStudy?.cohorts.find((ec) => ec.cohortId === c.cohortId);
                    return ec && ec.stageCount !== c.stages.length;
                  }).length;
                  const unchangedCount = parsedStudy.cohorts.length - newCount - changedCount;
                  const parts = [];
                  if (newCount) parts.push(`add ${newCount} new cohort${newCount > 1 ? "s" : ""}`);
                  if (changedCount) parts.push(`update stages for ${changedCount} cohort${changedCount > 1 ? "s" : ""}`);
                  if (unchangedCount) parts.push(`${unchangedCount} cohort${unchangedCount > 1 ? "s" : ""} unchanged`);
                  return `This will ${parts.join(", ")} in "${parsedStudy.title}". Existing participant progress and chat logs are preserved.`;
                })()}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setImportState("validated")}
                className="rounded-[5px] border border-input-border px-4 py-2 text-sm font-medium text-heading hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleImportStudy}
                className="rounded-[5px] bg-red-600 px-4 py-2 text-sm font-medium text-white"
              >
                Yes, update study
              </button>
            </div>
          </div>
        )}

        {/* Importing */}
        {importState === "importing" && (
          <div className="py-6 text-center">
            <p className="text-sm text-gray-500">Importing...</p>
          </div>
        )}
      </section>

      {/* ── Upload Participants CSV ── */}
      <section className="mb-8 rounded-lg border border-gray-200 p-6">
        <h2 className="text-lg font-medium text-heading mb-3">Upload Participants CSV</h2>
        <p className="text-sm text-body mb-3">
          Bulk-create participants from a CSV file. Passwords are hashed before storage.
          CSV format: <code className="bg-gray-100 px-1 rounded text-xs">user,password,study_id,cohort_id</code>.{" "}
          <code className="bg-gray-100 px-1 rounded text-xs">study_id</code> and{" "}
          <code className="bg-gray-100 px-1 rounded text-xs">cohort_id</code> must match existing studies and cohorts.
        </p>

        {/* Drop zone / idle */}
        {(csvState === "idle" || csvState === "error" || csvState === "done") && (
          <>
            <div
              onDragOver={(e) => { e.preventDefault(); setCsvDragOver(true); }}
              onDragLeave={() => setCsvDragOver(false)}
              onDrop={handleCsvDrop}
              className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors cursor-pointer ${
                csvDragOver ? "border-btn-active-bg bg-green-50" : "border-gray-300 hover:border-gray-400"
              }`}
              onClick={() => document.getElementById("csv-file-input")?.click()}
            >
              <p className="text-sm text-gray-500">
                Drop a <code className="bg-gray-100 px-1 rounded text-xs">.csv</code> file here or click to browse
              </p>
              <input
                id="csv-file-input"
                type="file"
                accept=".csv"
                onChange={handleCsvSelect}
                className="hidden"
              />
            </div>
            {csvState === "error" && (
              <p className="mt-3 text-sm text-red-600 whitespace-pre-wrap">{csvError}</p>
            )}
            {csvState === "done" && (
              <p className="mt-3 text-sm text-green-700">{csvResult}</p>
            )}
          </>
        )}

        {/* Validating */}
        {csvState === "validating" && (
          <div className="py-6 text-center">
            <p className="text-sm text-gray-500">Validating {csvFile?.name}...</p>
          </div>
        )}

        {/* Validated — show per-row results */}
        {csvState === "validated" && csvRows.length > 0 && (
          <div className="space-y-4">
            <div className="flex items-start justify-between">
              <p className="text-sm text-heading font-medium">
                {csvRows.length} rows from {csvFile?.name}
              </p>
              <button onClick={resetCsv} className="text-xs text-gray-400 hover:text-heading">&times; Clear</button>
            </div>

            {/* Summary counts */}
            <div className="flex gap-4 text-xs">
              {csvRows.filter((r) => r.status === "create").length > 0 && (
                <span className="text-green-700">{csvRows.filter((r) => r.status === "create").length} new</span>
              )}
              {csvRows.filter((r) => r.status === "update_password").length > 0 && (
                <span className="text-blue-600">{csvRows.filter((r) => r.status === "update_password").length} password update</span>
              )}
              {csvRows.filter((r) => r.status === "reassign").length > 0 && (
                <span className="text-amber-600">{csvRows.filter((r) => r.status === "reassign").length} reassign</span>
              )}
              {csvRows.filter((r) => r.status === "error").length > 0 && (
                <span className="text-red-600">{csvRows.filter((r) => r.status === "error").length} errors</span>
              )}
            </div>

            {/* Row details */}
            <div className="bg-gray-50 rounded-[5px] border border-gray-200 p-3 max-h-60 overflow-y-auto text-xs space-y-1 font-mono">
              {csvRows.map((r) => (
                <div key={r.row} className={`flex gap-2 ${r.status === "error" ? "text-red-600" : r.status === "reassign" ? "text-amber-700" : r.status === "update_password" ? "text-blue-600" : "text-body"}`}>
                  <span className="text-gray-400 w-8 shrink-0">#{r.row}</span>
                  <span className="w-36 shrink-0 truncate">{r.user}</span>
                  <span className="w-28 shrink-0">{r.studyId}/{r.cohortId}</span>
                  <span className="truncate">{r.message}</span>
                </div>
              ))}
            </div>

            {/* Action buttons */}
            {csvRows.some((r) => r.status !== "error") ? (
              <div className="flex items-center gap-3">
                <button
                  onClick={handleUploadCsv}
                  className="rounded-[5px] bg-btn-active-bg px-4 py-2 text-sm font-medium text-btn-active-text"
                >
                  Create / Update Participants
                </button>
                {csvRows.some((r) => r.status === "error") && (
                  <span className="text-xs text-gray-400">Rows with errors will be skipped</span>
                )}
              </div>
            ) : (
              <p className="text-sm text-red-600">All rows have errors — nothing to import.</p>
            )}
          </div>
        )}

        {/* Uploading */}
        {csvState === "uploading" && (
          <div className="py-6 text-center">
            <p className="text-sm text-gray-500">Creating participants...</p>
          </div>
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
            {studies.filter((s) => !s.isHidden).map((s) => (
              <option key={s.id} value={s.id}>{s.title} ({s.studyId})</option>
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
                {c.label} ({c.cohortId}, {c.stageCount} stages{c.provider ? `, ${c.provider}` : ""})
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

      {/* ── API Keys ── */}
      <section className="mb-8 rounded-lg border border-gray-200 p-6">
        <h2 className="text-lg font-medium text-heading mb-3">API Keys</h2>
        <p className="text-sm text-body mb-3">
          LLM API keys for chatbot stages. Keys are stored in a database pool and load-balanced across participants.
        </p>

        {/* Existing keys */}
        {apiKeys.length > 0 && (
          <div className="mb-4 space-y-1">
            {apiKeys.map((k) => (
              <div key={k.id} className="flex items-center gap-3 text-sm py-1">
                <code className="font-mono text-xs bg-gray-100 px-1.5 py-0.5 rounded w-20 text-center">{k.provider}</code>
                <code className="font-mono text-xs text-gray-500">{k.key_preview}</code>
                <span className="text-xs text-gray-400">{k.session_assignment_count} uses</span>
                <span className={`text-xs ${k.is_active ? "text-green-600" : "text-gray-400"}`}>
                  {k.is_active ? "active" : "inactive"}
                </span>
                <div className="ml-auto flex gap-2">
                  <button
                    onClick={async () => {
                      await fetch("/api/admin/api-keys", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "toggle", keyId: k.id }) });
                      fetchApiKeys();
                    }}
                    className="text-xs text-gray-400 hover:text-heading"
                  >
                    {k.is_active ? "Disable" : "Enable"}
                  </button>
                  <button
                    onClick={async () => {
                      if (!confirm(`Delete this ${k.provider} key (${k.key_preview})?`)) return;
                      await fetch("/api/admin/api-keys", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "delete", keyId: k.id }) });
                      fetchApiKeys();
                    }}
                    className="text-xs text-gray-400 hover:text-red-500"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
        {apiKeys.length === 0 && (
          <p className="text-sm text-gray-400 mb-4">No API keys configured.</p>
        )}

        {/* Add key form */}
        <div className="flex items-center gap-3">
          <select
            value={newKeyProvider}
            onChange={(e) => setNewKeyProvider(e.target.value)}
            className="rounded-[5px] border border-input-border px-3 py-2 text-sm outline-none"
          >
            <option value="anthropic">Anthropic</option>
            <option value="openai">OpenAI</option>
            <option value="gemini">Gemini</option>
          </select>
          <input
            type="text"
            value={newKeyValue}
            onChange={(e) => setNewKeyValue(e.target.value)}
            placeholder="Paste API key..."
            className="flex-1 rounded-[5px] border border-input-border px-3 py-2 text-sm font-mono outline-none"
          />
          <button
            onClick={async () => {
              if (!newKeyValue.trim()) return;
              setAddingKey(true);
              try {
                const res = await fetch("/api/admin/api-keys", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "add", provider: newKeyProvider, apiKey: newKeyValue.trim() }) });
                if (res.ok) {
                  setNewKeyValue("");
                  fetchApiKeys();
                } else {
                  const data = await res.json();
                  alert(data.error || "Failed to add key.");
                }
              } finally {
                setAddingKey(false);
              }
            }}
            disabled={!newKeyValue.trim() || addingKey}
            className="rounded-[5px] bg-btn-active-bg px-4 py-2 text-sm font-medium text-btn-active-text disabled:bg-btn-inactive-bg disabled:text-btn-inactive-text"
          >
            {addingKey ? "Adding..." : "Add Key"}
          </button>
        </div>
      </section>

      {/* ── Studies & Cohorts ── */}
      <section className="rounded-lg border border-gray-200 p-6">
        <h2 className="text-lg font-medium text-heading mb-3">Studies & Cohorts</h2>
        {studies.filter((s) => !s.isHidden).length === 0 && <p className="text-sm text-gray-500">No active studies.</p>}
        {studies.filter((s) => !s.isHidden).map((s) => (
          <div key={s.id} className="mb-4 last:mb-0">
            <p className="text-sm font-medium text-heading flex items-center gap-2">
              {s.title} <code className="font-mono text-xs bg-gray-100 px-1 rounded font-normal text-gray-500">{s.studyId}</code>
              <button
                onClick={async () => {
                  await fetch("/api/admin/list-studies", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "toggle-hide", studyId: s.id }) });
                  fetchStudies();
                }}
                className="text-xs text-gray-400 hover:text-red-500 ml-auto"
              >
                Deactivate
              </button>
            </p>
            <div className="ml-4 mt-1 space-y-0.5">
              {s.cohorts.map((c) => (
                <p key={c.cohortId} className="text-sm text-body">
                  <code className="font-mono text-xs bg-gray-100 px-1 rounded">{c.cohortId}</code>{" "}
                  {c.label} ({c.stageCount} stages{c.provider ? `, ${c.provider} ${c.model}` : ""}){" "}
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
          </div>
        ))}

        {/* Deactivated studies (collapsed) */}
        {studies.filter((s) => s.isHidden).length > 0 && (
          <details className="mt-6">
            <summary className="text-sm text-gray-400 cursor-pointer hover:text-gray-600">
              Deactivated studies ({studies.filter((s) => s.isHidden).length})
            </summary>
            <div className="mt-2 space-y-3 opacity-60">
              {studies.filter((s) => s.isHidden).map((s) => (
                <div key={s.id}>
                  <p className="text-sm text-gray-500 flex items-center gap-2">
                    {s.title} <code className="font-mono text-xs bg-gray-100 px-1 rounded">{s.studyId}</code>
                    <button
                      onClick={async () => {
                        await fetch("/api/admin/list-studies", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "toggle-hide", studyId: s.id }) });
                        fetchStudies();
                      }}
                      className="text-xs text-gray-400 hover:text-green-600 ml-auto"
                    >
                      Activate
                    </button>
                  </p>
                  <div className="ml-4 mt-1 space-y-0.5">
                    {s.cohorts.map((c) => (
                      <p key={c.cohortId} className="text-sm text-gray-400">
                        <code className="font-mono text-xs">{c.cohortId}</code> {c.label} ({c.stageCount} stages)
                      </p>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </details>
        )}
      </section>
    </main>
  );
}
