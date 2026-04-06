import { parseStudyYaml } from "./yaml-parser";
import { prisma } from "./prisma";

export interface ImportResult {
  studyId: number;
  title: string;
  cohorts: { cohortId: string; label: string; stageCount: number }[];
}

/**
 * Import a study from a directory path into the database.
 * Reuses the same logic as cli/import-study.ts.
 */
export async function importStudyFromDir(studyDir: string): Promise<ImportResult> {
  const parsed = parseStudyYaml(studyDir);

  // Upsert study
  const study = await prisma.study.upsert({
    where: { studyId: parsed.studyId },
    create: {
      studyId: parsed.studyId,
      title: parsed.title,
      description: parsed.description,
      sourceDir: parsed.sourceDir,
    },
    update: {
      description: parsed.description,
      sourceDir: parsed.sourceDir,
    },
  });

  const cohortResults: ImportResult["cohorts"] = [];

  for (const c of parsed.cohorts) {
    const cohort = await prisma.cohort.upsert({
      where: { studyId_cohortId: { studyId: study.id, cohortId: c.cohortId } },
      create: {
        cohortId: c.cohortId,
        label: c.label,
        provider: c.provider,
        model: c.model,
        fallbackProvider: c.fallbackProvider,
        fallbackModel: c.fallbackModel,
        studyId: study.id,
      },
      update: {
        label: c.label,
        provider: c.provider,
        model: c.model,
        fallbackProvider: c.fallbackProvider,
        fallbackModel: c.fallbackModel,
      },
    });

    // Delete existing stages for this cohort
    await prisma.stage.deleteMany({ where: { cohortId: cohort.id } });

    // Create stages from flow
    for (const s of c.stages) {
      const { stageId: _sid, title: _t, durationSeconds: _d, order: _o, contentRef: _cr, contentText: _ct, ...config } = s;

      const stage = await prisma.stage.create({
        data: {
          stageId: s.stageId,
          title: s.title,
          duration: s.durationSeconds,
          order: s.order,
          contentText: s.contentText,
          config: JSON.parse(JSON.stringify(config)),
          cohortId: cohort.id,
        },
      });

      for (const f of s.files) {
        await prisma.stageFile.create({
          data: {
            filename: f.filename,
            description: f.description,
            sha256: f.sha256,
            stageId: stage.id,
          },
        });
      }
    }

    cohortResults.push({
      cohortId: c.cohortId,
      label: c.label,
      stageCount: c.stages.length,
    });
  }

  return {
    studyId: study.id,
    title: parsed.title,
    cohorts: cohortResults,
  };
}
