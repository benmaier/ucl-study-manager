import { prisma } from "../src/lib/prisma.js";
import { generateIdentifiers } from "./lib/id-generator.js";

const sessionIdArg = process.argv[2];
const countIdx = process.argv.indexOf("--count");
const groupIdx = process.argv.indexOf("--cohort");

if (!sessionIdArg || countIdx === -1 || groupIdx === -1) {
  console.error(
    "Usage: npx tsx cli/generate-participants.ts <session-id> --count <N> --cohort <cohort-id>"
  );
  process.exit(1);
}

const sessionId = parseInt(sessionIdArg, 10);
const count = parseInt(process.argv[countIdx + 1], 10);
const cohortId = process.argv[groupIdx + 1];

if (isNaN(sessionId) || isNaN(count) || !cohortId) {
  console.error("Error: session-id and count must be numbers, cohort must be a string.");
  process.exit(1);
}

if (count < 1 || count > 1000) {
  console.error("Error: count must be between 1 and 1000.");
  process.exit(1);
}

try {
  // Validate session exists
  const session = await prisma.studySession.findUnique({
    where: { id: sessionId },
    include: { study: true },
  });
  if (!session) {
    console.error(`Error: Session with ID ${sessionId} not found.`);
    process.exit(1);
  }

  // Find the cohort (must belong to the same study)
  const cohort = await prisma.cohort.findFirst({
    where: { studyId: session.studyId, cohortId },
  });
  if (!cohort) {
    const available = await prisma.cohort.findMany({
      where: { studyId: session.studyId },
      select: { cohortId: true },
    });
    console.error(
      `Error: Cohort "${cohortId}" not found for study "${session.study.title}". Available: ${available.map((c) => c.cohortId).join(", ")}`
    );
    process.exit(1);
  }

  // Get existing identifiers
  const existingIds = await prisma.participant.findMany({
    select: { identifier: true },
  });
  const existingSet = new Set(existingIds.map((p) => p.identifier));

  // Generate unique word-based identifiers
  const identifiers = generateIdentifiers(count, existingSet);

  // Create participants
  const participants = await prisma.participant.createManyAndReturn({
    data: identifiers.map((identifier) => ({
      identifier,
      sessionId,
      cohortId: cohort.id,
    })),
  });

  console.log(
    `\nGenerated ${participants.length} participants for session ${sessionId}, cohort "${cohortId}":`
  );
  console.log("─".repeat(50));
  for (const p of participants) {
    console.log(`  ${p.identifier}`);
  }
  console.log("─".repeat(50));
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
