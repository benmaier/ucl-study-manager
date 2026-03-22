import { prisma } from "../src/lib/prisma.js";

const studyIdArg = process.argv[2];
const labelIdx = process.argv.indexOf("--label");
const label = labelIdx !== -1 ? process.argv[labelIdx + 1] : undefined;

if (!studyIdArg) {
  console.error("Usage: npx tsx cli/create-session.ts <study-id> [--label \"Session Name\"]");
  process.exit(1);
}

const studyId = parseInt(studyIdArg, 10);
if (isNaN(studyId)) {
  console.error("Error: study-id must be a number.");
  process.exit(1);
}

try {
  const study = await prisma.study.findUnique({ where: { id: studyId } });
  if (!study) {
    console.error(`Error: Study with ID ${studyId} not found.`);
    process.exit(1);
  }

  const session = await prisma.studySession.create({
    data: {
      studyId,
      label: label ?? null,
    },
  });

  console.log(`Created session ID: ${session.id}`);
  console.log(`  Study: "${study.title}" (ID: ${studyId})`);
  if (session.label) console.log(`  Label: "${session.label}"`);
  console.log(`  Created at: ${session.createdAt.toISOString()}`);
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
