import { NextRequest, NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";

interface RowResult {
  row: number;
  user: string;
  password: string;
  studyId: string;
  cohortId: string;
  status: "create" | "update_password" | "reassign" | "error";
  message: string;
}

/**
 * Validate a CSV of participants without creating anything.
 * Returns per-row status so the admin can review before committing.
 */
export async function POST(request: NextRequest) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const formData = await request.formData();
  const file = formData.get("file") as File | null;

  if (!file) {
    return NextResponse.json({ error: "Please upload a CSV file." }, { status: 400 });
  }

  const text = await file.text();
  const lines = text.trim().split("\n");

  if (lines.length < 2) {
    return NextResponse.json({ error: "CSV must have a header row and at least one data row." }, { status: 400 });
  }

  const header = lines[0].split(",").map((h) => h.trim().toLowerCase());
  const userIdx = header.indexOf("user");
  const passIdx = header.indexOf("password");
  const studyIdx = header.findIndex((h) => h === "study_id" || h === "study_identifier");
  const cohortIdx = header.findIndex((h) => h === "cohort_id" || h === "cohort_identifier");

  if (userIdx === -1 || passIdx === -1 || studyIdx === -1 || cohortIdx === -1) {
    return NextResponse.json(
      { error: "CSV must have columns: user, password, study_id, cohort_id" },
      { status: 400 }
    );
  }

  const results: RowResult[] = [];

  // Collect all errors up front rather than stopping at first
  const allStudyIds = new Set<string>();
  const allCohortKeys = new Set<string>(); // "studyId:cohortId"
  const allUsernames = new Set<string>();

  // Parse all rows first
  const rows: { row: number; user: string; password: string; studyId: string; cohortId: string }[] = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const cols = line.split(",").map((c) => c.trim());
    const user = cols[userIdx] || "";
    const password = cols[passIdx] || "";
    const studyId = cols[studyIdx] || "";
    const cohortId = cols[cohortIdx] || "";
    rows.push({ row: i + 1, user, password, studyId, cohortId });
    if (studyId) allStudyIds.add(studyId);
    if (studyId && cohortId) allCohortKeys.add(`${studyId}:${cohortId}`);
    if (user) allUsernames.add(user);
  }

  // Batch-fetch all referenced studies
  const studyRecords = await prisma.study.findMany({
    where: { studyId: { in: Array.from(allStudyIds) } },
    select: { id: true, studyId: true },
  });
  const studyMap = new Map(studyRecords.map((s) => [s.studyId!, s.id]));

  // Batch-fetch all referenced cohorts
  const cohortRecords = await prisma.cohort.findMany({
    where: {
      OR: Array.from(allCohortKeys).map((key) => {
        const [sid, cid] = key.split(":");
        const dbStudyId = studyMap.get(sid);
        return dbStudyId ? { studyId: dbStudyId, cohortId: cid } : { id: -1 };
      }),
    },
    select: { id: true, studyId: true, cohortId: true },
  });
  const cohortMap = new Map(
    cohortRecords.map((c) => {
      const study = studyRecords.find((s) => s.id === c.studyId);
      return [`${study?.studyId}:${c.cohortId}`, c.id];
    })
  );

  // Batch-fetch all existing participants by username
  const existingParticipants = await prisma.participant.findMany({
    where: { identifier: { in: Array.from(allUsernames) } },
    select: { id: true, identifier: true, cohortId: true, cohort: { select: { cohortId: true, study: { select: { studyId: true } } } } },
  });
  const participantMap = new Map(existingParticipants.map((p) => [p.identifier, p]));

  // Validate each row
  for (const r of rows) {
    if (!r.user || !r.password || !r.studyId || !r.cohortId) {
      results.push({ ...r, status: "error", message: "Missing fields" });
      continue;
    }

    const studyExists = studyMap.has(r.studyId);
    const cohortExists = cohortMap.has(`${r.studyId}:${r.cohortId}`);

    if (!studyExists) {
      results.push({ ...r, status: "error", message: `Study "${r.studyId}" not found` });
      continue;
    }
    if (!cohortExists) {
      results.push({ ...r, status: "error", message: `Cohort "${r.cohortId}" not found in study "${r.studyId}"` });
      continue;
    }

    const existing = participantMap.get(r.user);
    if (existing) {
      const sameStudy = existing.cohort.study.studyId === r.studyId;
      const sameCohort = sameStudy && existing.cohort.cohortId === r.cohortId;

      if (sameCohort) {
        results.push({ ...r, status: "update_password", message: `Already exists in this cohort — password will be updated` });
      } else {
        const fromStudy = existing.cohort.study.studyId;
        const fromCohort = existing.cohort.cohortId;
        results.push({ ...r, status: "reassign", message: `Exists in ${fromStudy}/${fromCohort} — will be reassigned (old data preserved)` });
      }
    } else {
      results.push({ ...r, status: "create", message: "New participant" });
    }
  }

  return NextResponse.json({ results });
}
