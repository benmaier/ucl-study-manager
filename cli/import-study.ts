import { parseStudyYaml } from "../src/lib/yaml-parser.js";
import { prisma } from "../src/lib/prisma.js";

const yamlDir = process.argv[2];

if (!yamlDir) {
  console.error("Usage: npx tsx cli/import-study.ts <path-to-study-dir>");
  process.exit(1);
}

try {
  const parsed = parseStudyYaml(yamlDir);
  console.log(
    `Parsed study: "${parsed.title}" (${parsed.cohorts.length} cohorts, ${parsed.cohorts.reduce((n, c) => n + c.stages.length, 0)} total stages)`
  );

  const study = await prisma.$transaction(async (tx) => {
    // Upsert study by title
    const existing = await tx.study.findFirst({ where: { title: parsed.title } });
    const study = await tx.study.upsert({
      where: { id: existing?.id ?? 0 },
      create: {
        title: parsed.title,
        description: parsed.description,
        sourceDir: parsed.sourceDir,
        fallbackProvider: parsed.fallbackProvider,
        fallbackModel: parsed.fallbackModel,
      },
      update: {
        description: parsed.description,
        sourceDir: parsed.sourceDir,
        fallbackProvider: parsed.fallbackProvider,
        fallbackModel: parsed.fallbackModel,
      },
    });

    // Upsert cohorts (preserve IDs so participant references survive re-import)
    const cohortDbIds = new Map<string, number>();
    for (const c of parsed.cohorts) {
      const cohort = await tx.cohort.upsert({
        where: { studyId_cohortId: { studyId: study.id, cohortId: c.cohortId } },
        create: {
          cohortId: c.cohortId,
          label: c.label,
          aiAccess: c.aiAccess,
          aiTraining: c.aiTraining,
          provider: c.provider,
          model: c.model,
          fallbackProvider: c.fallbackProvider,
          fallbackModel: c.fallbackModel,
          studyFlowRef: c.studyFlowRef,
          studyId: study.id,
        },
        update: {
          label: c.label,
          aiAccess: c.aiAccess,
          aiTraining: c.aiTraining,
          provider: c.provider,
          model: c.model,
          fallbackProvider: c.fallbackProvider,
          fallbackModel: c.fallbackModel,
          studyFlowRef: c.studyFlowRef,
        },
      });
      cohortDbIds.set(c.cohortId, cohort.id);

      // Delete existing stages for this cohort (safe — stages don't own participants)
      await tx.stage.deleteMany({ where: { cohortId: cohort.id } });

      // Create stages from flow
      for (const s of c.stages) {
        const stage = await tx.stage.create({
          data: {
            stageId: s.stageId,
            title: s.title,
            duration: s.durationSeconds,
            order: s.order,
            contentRef: s.contentRef,
            contentText: s.contentText,
            chatbot: s.chatbot,
            questions: s.questions,
            inputLabel: s.input?.label ?? null,
            inputPrompt: s.input?.prompt ?? null,
            linkLabel: s.link?.label ?? null,
            linkUrl: s.link?.url ?? null,
            confirmation: s.confirmation,
            cohortId: cohort.id,
          },
        });

        for (const f of s.files) {
          await tx.stageFile.create({
            data: {
              filename: f.filename,
              description: f.description,
              sha256: f.sha256,
              stageId: stage.id,
            },
          });
        }
      }
    }

    // Remove cohorts no longer in YAML
    const yamlCohortIds = parsed.cohorts.map((c) => c.cohortId);
    await tx.cohort.deleteMany({
      where: { studyId: study.id, cohortId: { notIn: yamlCohortIds } },
    });

    return study;
  });

  console.log(`\nImported study ID: ${study.id}`);
  console.log(`  Title: ${study.title}`);
  for (const c of parsed.cohorts) {
    const flags = [
      c.aiAccess ? "AI" : "no-AI",
      c.aiTraining ? "trained" : "untrained",
    ].join(", ");
    console.log(`  Cohort "${c.cohortId}" (${flags}): ${c.stages.length} stages via ${c.studyFlowRef}`);
  }
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
