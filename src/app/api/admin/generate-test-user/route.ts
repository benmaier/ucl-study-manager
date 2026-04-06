import { NextRequest, NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";
import { generateCredentials } from "@/lib/id-generator";
import bcrypt from "bcryptjs";

export async function POST(request: NextRequest) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { studyId, cohortId } = (await request.json()) as {
    studyId?: number;
    cohortId?: string;
  };

  if (!studyId || !cohortId) {
    return NextResponse.json({ error: "studyId and cohortId are required." }, { status: 400 });
  }

  // Find cohort
  const cohort = await prisma.cohort.findFirst({
    where: { studyId, cohortId },
  });
  if (!cohort) {
    return NextResponse.json({ error: `Cohort "${cohortId}" not found in study ${studyId}.` }, { status: 404 });
  }

  // Find or create session
  let session = await prisma.studySession.findFirst({
    where: { studyId },
    orderBy: { createdAt: "desc" },
  });
  if (!session) {
    session = await prisma.studySession.create({
      data: { studyId, label: "Test session (admin)" },
    });
  }

  // Get existing identifiers to avoid collisions
  const existingParticipants = await prisma.participant.findMany({
    select: { identifier: true },
  });
  const existingSet = new Set(existingParticipants.map((p) => p.identifier));

  // Generate credentials
  const [cred] = generateCredentials(1, existingSet);
  const hashed = await bcrypt.hash(cred.password, 10);

  // Create participant
  await prisma.participant.create({
    data: {
      identifier: cred.username,
      dbUser: cred.username,
      dbPassword: hashed,
      isTestUser: true,
      sessionId: session.id,
      cohortId: cohort.id,
    },
  });

  return NextResponse.json({
    username: cred.username,
    password: cred.password,
    cohort: cohort.label,
    isTestUser: true,
  });
}
