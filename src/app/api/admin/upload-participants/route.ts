import { NextRequest, NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";

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

  const errors: string[] = [];
  let created = 0;
  let updated = 0;
  let reassigned = 0;

  const sessionCache = new Map<string, number>();

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const cols = line.split(",").map((c) => c.trim());
    const username = cols[userIdx];
    const password = cols[passIdx];
    const studyIdentifier = cols[studyIdx];
    const cohortIdentifier = cols[cohortIdx];

    if (!username || !password || !studyIdentifier || !cohortIdentifier) {
      errors.push(`Row ${i + 1}: missing fields`);
      continue;
    }

    const study = await prisma.study.findFirst({ where: { studyId: studyIdentifier } });
    if (!study) {
      errors.push(`Row ${i + 1}: study "${studyIdentifier}" not found`);
      continue;
    }

    const cohort = await prisma.cohort.findFirst({
      where: { studyId: study.id, cohortId: cohortIdentifier },
    });
    if (!cohort) {
      errors.push(`Row ${i + 1}: cohort "${cohortIdentifier}" not found in study "${studyIdentifier}"`);
      continue;
    }

    // Find or create session
    let sessionId = sessionCache.get(studyIdentifier);
    if (!sessionId) {
      let session = await prisma.studySession.findFirst({
        where: { studyId: study.id },
        orderBy: { createdAt: "desc" },
      });
      if (!session) {
        session = await prisma.studySession.create({
          data: { studyId: study.id, label: "Imported via admin" },
        });
      }
      sessionId = session.id;
      sessionCache.set(studyIdentifier, sessionId);
    }

    const hashed = await bcrypt.hash(password, 10);

    // Check if participant already exists
    const existing = await prisma.participant.findUnique({ where: { identifier: username } });

    if (existing) {
      // Update password and optionally reassign cohort/session
      await prisma.participant.update({
        where: { id: existing.id },
        data: {
          dbPassword: hashed,
          cohortId: cohort.id,
          sessionId,
        },
      });
      if (existing.cohortId === cohort.id) {
        updated++;
      } else {
        reassigned++;
      }
    } else {
      await prisma.participant.create({
        data: {
          identifier: username,
          dbUser: username,
          dbPassword: hashed,
          isTestUser: false,
          sessionId,
          cohortId: cohort.id,
        },
      });
      created++;
    }
  }

  return NextResponse.json({ created, updated, reassigned, errors, total: lines.length - 1 });
}
