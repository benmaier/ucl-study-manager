import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { prisma } from "../src/lib/prisma.js";

const sessionIdArg = process.argv[2];
const outputIdx = process.argv.indexOf("--output-dir");
const outputDir = outputIdx !== -1 ? process.argv[outputIdx + 1] : "./exports";

if (!sessionIdArg) {
  console.error("Usage: npx tsx cli/export-results.ts <session-id> [--output-dir ./exports]");
  process.exit(1);
}

const sessionId = parseInt(sessionIdArg, 10);
if (isNaN(sessionId)) {
  console.error("Error: session-id must be a number.");
  process.exit(1);
}

try {
  const session = await prisma.studySession.findUnique({
    where: { id: sessionId },
    include: {
      study: true,
      participants: {
        include: {
          cohort: true,
          progress: {
            include: { stage: true },
            orderBy: { stage: { order: "asc" } },
          },
          chatLogs: {
            include: { files: true },
            orderBy: [{ stageId: "asc" }, { turnNumber: "asc" }],
          },
        },
      },
    },
  });

  if (!session) {
    console.error(`Error: Session with ID ${sessionId} not found.`);
    process.exit(1);
  }

  mkdirSync(outputDir, { recursive: true });

  // Export participants overview
  const participantsOverview = session.participants.map((p) => ({
    id: p.id,
    identifier: p.identifier,
    name: p.name,
    cohort: p.cohort.cohortId,
    cohortLabel: p.cohort.label,
    stagesCompleted: p.progress.filter((pr) => pr.completedAt).length,
    totalChatTurns: p.chatLogs.length,
  }));

  // Export progress data
  const progressData = session.participants.flatMap((p) =>
    p.progress.map((pr) => ({
      participantId: p.id,
      identifier: p.identifier,
      cohort: p.cohort.cohortId,
      stageId: pr.stage.stageId,
      stageTitle: pr.stage.title,
      startedAt: pr.startedAt.toISOString(),
      completedAt: pr.completedAt?.toISOString() ?? null,
      durationMs: pr.completedAt
        ? pr.completedAt.getTime() - pr.startedAt.getTime()
        : null,
    }))
  );

  // Export chat logs
  const chatData = session.participants.flatMap((p) =>
    p.chatLogs.map((cl) => ({
      participantId: p.id,
      identifier: p.identifier,
      cohort: p.cohort.cohortId,
      stageId: cl.stageId,
      turnNumber: cl.turnNumber,
      role: cl.role,
      content: cl.content,
      provider: cl.provider,
      model: cl.model,
      inputTokens: cl.inputTokens,
      outputTokens: cl.outputTokens,
      createdAt: cl.createdAt.toISOString(),
      files: cl.files.map((f) => ({
        filename: f.filename,
        isKnownFile: f.isKnownFile,
        knownFileRef: f.knownFileRef,
        mimeType: f.mimeType,
        sha256: f.sha256,
        hasData: !!f.base64Data,
      })),
    }))
  );

  // Write JSON files
  const sessionMeta = {
    sessionId: session.id,
    label: session.label,
    studyTitle: session.study.title,
    createdAt: session.createdAt.toISOString(),
    participantCount: session.participants.length,
  };

  writeFileSync(join(outputDir, "session.json"), JSON.stringify(sessionMeta, null, 2));
  writeFileSync(join(outputDir, "participants.json"), JSON.stringify(participantsOverview, null, 2));
  writeFileSync(join(outputDir, "progress.json"), JSON.stringify(progressData, null, 2));
  writeFileSync(join(outputDir, "chat-logs.json"), JSON.stringify(chatData, null, 2));

  // Write CSV for progress
  const progressCsv = [
    "participant_id,identifier,cohort,stage_id,stage_title,started_at,completed_at,duration_ms",
    ...progressData.map(
      (r) =>
        `${r.participantId},${r.identifier},${r.cohort},${r.stageId},"${r.stageTitle}",${r.startedAt},${r.completedAt ?? ""},${r.durationMs ?? ""}`
    ),
  ].join("\n");
  writeFileSync(join(outputDir, "progress.csv"), progressCsv);

  // Export unknown files (base64 → actual files)
  const filesDir = join(outputDir, "files");
  let fileCount = 0;
  for (const p of session.participants) {
    for (const cl of p.chatLogs) {
      for (const f of cl.files) {
        if (f.base64Data && !f.isKnownFile) {
          const pDir = join(filesDir, `participant_${p.id}`, `stage_${cl.stageId}`);
          mkdirSync(pDir, { recursive: true });
          writeFileSync(join(pDir, f.filename), Buffer.from(f.base64Data, "base64"));
          fileCount++;
        }
      }
    }
  }

  console.log(`\nExported session ${sessionId} to ${outputDir}/`);
  console.log(`  Study: "${session.study.title}"`);
  console.log(`  Participants: ${session.participants.length}`);
  console.log(`  Progress records: ${progressData.length}`);
  console.log(`  Chat log entries: ${chatData.length}`);
  console.log(`  Unknown files exported: ${fileCount}`);
  console.log(`\nFiles written:`);
  console.log(`  ${outputDir}/session.json`);
  console.log(`  ${outputDir}/participants.json`);
  console.log(`  ${outputDir}/progress.json`);
  console.log(`  ${outputDir}/progress.csv`);
  console.log(`  ${outputDir}/chat-logs.json`);
  if (fileCount > 0) console.log(`  ${outputDir}/files/...`);
} catch (err) {
  if (err instanceof Error) {
    console.error(`Error: ${err.message}`);
  } else {
    console.error(err);
  }
  process.exit(1);
} finally {
  await prisma.$disconnect();
}
