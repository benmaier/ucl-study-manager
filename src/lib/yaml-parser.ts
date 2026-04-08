import { readFileSync, existsSync, readdirSync } from "fs";
import { resolve, join } from "path";
import { createHash } from "crypto";
import { parse as parseYaml } from "yaml";
import type {
  RawStudyYaml,
  RawCohortYaml,
  RawCohortStageOverride,
  RawStage,
  ParsedStudy,
  ParsedCohort,
  ParsedStage,
  ParsedStageFile,
} from "./yaml-types.js";

class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

export function parseDuration(duration: string): number {
  const match = duration.match(/^(\d+):(\d{2})$/);
  if (!match) {
    throw new ValidationError(
      `Invalid duration format "${duration}". Expected "MM:SS" (e.g., "5:00", "30:00").`
    );
  }
  const minutes = parseInt(match[1], 10);
  const seconds = parseInt(match[2], 10);
  if (seconds >= 60) {
    throw new ValidationError(
      `Invalid seconds value ${seconds} in duration "${duration}". Seconds must be 0-59.`
    );
  }
  return minutes * 60 + seconds;
}

function hashFile(filePath: string): string {
  const data = readFileSync(filePath);
  return createHash("sha256").update(data).digest("hex");
}

function readYaml<T>(filePath: string): T {
  if (!existsSync(filePath)) {
    throw new ValidationError(`File not found: ${filePath}`);
  }
  const content = readFileSync(filePath, "utf-8");
  return parseYaml(content) as T;
}

// ── Deep copy helper ──

function deepCopy<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

// ── Merge algorithm: apply cohort overrides to base stages ──

export function mergeStages(
  baseStages: RawStage[],
  overrides: RawCohortStageOverride[] | undefined,
  cohortId: string,
): RawStage[] {
  if (!overrides || overrides.length === 0) {
    return deepCopy(baseStages);
  }

  // Validate no duplicate override IDs
  const overrideIds = new Set<string>();
  for (const o of overrides) {
    if (!o.id) throw new ValidationError(`Cohort "${cohortId}": every stage override must have an 'id'.`);
    if (overrideIds.has(o.id)) {
      throw new ValidationError(`Cohort "${cohortId}": duplicate stage override ID "${o.id}".`);
    }
    overrideIds.add(o.id);
  }

  // Build base stage lookup
  const baseMap = new Map<string, RawStage>();
  for (const s of baseStages) {
    baseMap.set(s.id, s);
  }

  // Classify overrides
  const skips = new Set<string>();
  const fieldOverrides: RawCohortStageOverride[] = [];
  const additions: RawCohortStageOverride[] = [];

  for (const o of overrides) {
    const isBaseStage = baseMap.has(o.id);

    if (o.skip === true) {
      if (!isBaseStage) {
        throw new ValidationError(
          `Cohort "${cohortId}": cannot skip stage "${o.id}" — not found in base flow.`
        );
      }
      skips.add(o.id);
      continue;
    }

    if (isBaseStage) {
      if (o.after || o.before) {
        throw new ValidationError(
          `Cohort "${cohortId}", stage "${o.id}": cannot use 'after'/'before' on a base flow stage. Use skip + add to reposition.`
        );
      }
      fieldOverrides.push(o);
    } else {
      // New stage addition
      if (!o.after && !o.before) {
        throw new ValidationError(
          `Cohort "${cohortId}": new stage "${o.id}" must specify 'after' or 'before' for insertion position.`
        );
      }
      if (o.after && o.before) {
        throw new ValidationError(
          `Cohort "${cohortId}", stage "${o.id}": cannot specify both 'after' and 'before'.`
        );
      }
      if (!o.title) {
        throw new ValidationError(`Cohort "${cohortId}": new stage "${o.id}" must have a 'title'.`);
      }
      if (!o.duration) {
        throw new ValidationError(`Cohort "${cohortId}": new stage "${o.id}" must have a 'duration'.`);
      }
      additions.push(o);
    }
  }

  // Build merged list: deep copy base, remove skips
  const result: RawStage[] = [];
  for (const s of baseStages) {
    if (skips.has(s.id)) continue;
    result.push(deepCopy(s));
  }

  // Apply field overrides
  const overrideFields = [
    "title", "duration", "content", "chatbot", "provider", "model",
    "files", "questions", "input", "confirmation", "sidebar_panels",
  ] as const;

  for (const o of fieldOverrides) {
    const stage = result.find((s) => s.id === o.id);
    if (!stage) continue; // skipped stage — ignore override

    for (const field of overrideFields) {
      if (Object.hasOwn(o, field)) {
        const value = (o as unknown as Record<string, unknown>)[field];
        if (value === null) {
          delete (stage as unknown as Record<string, unknown>)[field];
        } else {
          (stage as unknown as Record<string, unknown>)[field] = value;
        }
      }
    }
  }

  // Insert new stages in override-array order
  for (const o of additions) {
    // Build the new RawStage from the addition
    const newStage: RawStage = {
      id: o.id,
      title: o.title!,
      duration: o.duration!,
    };
    // Copy optional fields
    for (const field of overrideFields) {
      if (field === "title" || field === "duration") continue;
      if (Object.hasOwn(o, field) && (o as unknown as Record<string, unknown>)[field] !== null) {
        (newStage as unknown as Record<string, unknown>)[field] = (o as unknown as Record<string, unknown>)[field];
      }
    }

    if (o.after) {
      const anchorIndex = result.findIndex((s) => s.id === o.after);
      if (anchorIndex === -1) {
        throw new ValidationError(
          `Cohort "${cohortId}", stage "${o.id}": 'after' references unknown stage "${o.after}".`
        );
      }
      result.splice(anchorIndex + 1, 0, newStage);
    } else if (o.before) {
      const anchorIndex = result.findIndex((s) => s.id === o.before);
      if (anchorIndex === -1) {
        throw new ValidationError(
          `Cohort "${cohortId}", stage "${o.id}": 'before' references unknown stage "${o.before}".`
        );
      }
      result.splice(anchorIndex, 0, newStage);
    }
  }

  return result;
}

// ── Resolve raw stages to parsed stages (load content, hash files) ──

function resolveStages(
  rawStages: RawStage[],
  studyDir: string,
  cohortId: string,
): ParsedStage[] {
  // Validate unique stage IDs in resolved list
  const stageIds = new Set<string>();
  for (const s of rawStages) {
    if (stageIds.has(s.id)) {
      throw new ValidationError(`Cohort "${cohortId}": duplicate stage ID "${s.id}" in resolved flow.`);
    }
    stageIds.add(s.id);
  }

  return rawStages.map((s, index) => {
    // Load MD content
    let contentText: string | null = null;
    if (s.content) {
      const mdPath = join(studyDir, s.content);
      if (!existsSync(mdPath)) {
        throw new ValidationError(
          `Cohort "${cohortId}", stage "${s.id}": content file "${s.content}" not found at ${mdPath}`
        );
      }
      contentText = readFileSync(mdPath, "utf-8");
    }

    // Hash stage files
    const files: ParsedStageFile[] = [];
    if (s.files) {
      for (const entry of s.files) {
        const filename = typeof entry === "string" ? entry : entry.filename;
        const description = typeof entry === "string" ? null : (entry.description ?? null);
        const filePath = join(studyDir, filename);
        if (!existsSync(filePath)) {
          throw new ValidationError(
            `Cohort "${cohortId}", stage "${s.id}": file "${filename}" not found at ${filePath}`
          );
        }
        files.push({ filename, description, sha256: hashFile(filePath) });
      }
    }

    return {
      stageId: s.id,
      title: s.title,
      durationSeconds: parseDuration(s.duration),
      order: index,
      contentRef: s.content ?? null,
      contentText,
      chatbot: s.chatbot ?? false,
      files,
      questions: s.questions ?? [],
      input: s.input ? { label: s.input.label, prompt: s.input.prompt ?? null } : null,
      confirmation: s.confirmation ?? null,
      sidebarPanels: (s.sidebar_panels ?? []).map((p) => ({
        title: p.title,
        content: p.content,
        defaultExpanded: p.defaultExpanded,
      })),
    };
  });
}

/**
 * Parse a study directory with inline base stages + cohort overrides:
 * study.yaml (with stages) + cohorts/*.yaml (overrides)
 *
 * Cohorts are auto-discovered from the cohorts/ subdirectory.
 * All paths in YAMLs are relative to the study directory.
 */
export function parseStudyYaml(studyDir: string): ParsedStudy {
  const absDir = resolve(studyDir);

  if (!existsSync(absDir)) {
    throw new ValidationError(`Study directory does not exist: ${absDir}`);
  }

  // Find and parse study.yaml
  const studyYamlPath = join(absDir, "study.yaml");
  if (!existsSync(studyYamlPath)) {
    throw new ValidationError(`No study.yaml found in ${absDir}`);
  }
  const rawStudy = readYaml<RawStudyYaml & Record<string, unknown>>(studyYamlPath);

  // Migration hints for old format
  if (Array.isArray((rawStudy as Record<string, unknown>).cohorts)) {
    throw new ValidationError(
      `study.yaml has a 'cohorts' list. This old format is no longer supported. ` +
      `Cohorts are now auto-discovered from the cohorts/ subdirectory. ` +
      `Move stages inline into study.yaml and remove the 'cohorts' field.`
    );
  }

  if (!rawStudy.id) {
    throw new ValidationError("study.yaml must have an 'id' field.");
  }
  if (!rawStudy.title) {
    throw new ValidationError("study.yaml must have a 'title' field.");
  }
  if (!Array.isArray(rawStudy.stages) || rawStudy.stages.length === 0) {
    throw new ValidationError("study.yaml must have at least one stage.");
  }

  // Validate base stages
  const baseStageIds = new Set<string>();
  for (const s of rawStudy.stages) {
    if (!s.id) throw new ValidationError("study.yaml: every stage must have an 'id'.");
    if (!s.title) throw new ValidationError(`study.yaml: stage "${s.id}" must have a 'title'.`);
    if (!s.duration) throw new ValidationError(`study.yaml: stage "${s.id}" must have a 'duration'.`);
    if (baseStageIds.has(s.id)) {
      throw new ValidationError(`study.yaml: duplicate stage ID "${s.id}".`);
    }
    baseStageIds.add(s.id);
  }

  // Auto-discover cohort files from cohorts/ subdirectory
  const cohortsDir = join(absDir, "cohorts");
  if (!existsSync(cohortsDir)) {
    throw new ValidationError(`No cohorts/ directory found in ${absDir}. Create it with at least one cohort YAML.`);
  }

  const cohortFiles = readdirSync(cohortsDir)
    .filter((f) => f.endsWith(".yaml") || f.endsWith(".yml"))
    .sort(); // deterministic order

  if (cohortFiles.length === 0) {
    throw new ValidationError(`No .yaml files found in ${cohortsDir}. Add at least one cohort.`);
  }

  // Parse each cohort
  const cohortIds = new Set<string>();
  const cohorts: ParsedCohort[] = [];

  for (const cohortFile of cohortFiles) {
    const cohortPath = join(cohortsDir, cohortFile);
    const rawCohort = readYaml<RawCohortYaml & Record<string, unknown>>(cohortPath);

    // Migration hint for old format
    if ((rawCohort as Record<string, unknown>).study_flow) {
      throw new ValidationError(
        `Cohort "${rawCohort.id || cohortFile}" uses the old 'study_flow' field. ` +
        `This has been replaced by inline stages in study.yaml with per-cohort stage overrides.`
      );
    }
    if (Object.hasOwn(rawCohort, "ai_access")) {
      throw new ValidationError(
        `Cohort "${rawCohort.id || cohortFile}" uses the old 'ai_access' field. ` +
        `AI access is now controlled per-stage via the 'chatbot' flag in stage overrides.`
      );
    }

    // Validate required fields
    if (!rawCohort.id) throw new ValidationError(`Cohort at "${cohortFile}": must have an 'id'.`);
    if (!rawCohort.label) throw new ValidationError(`Cohort "${rawCohort.id}": must have a 'label'.`);

    // Unique cohort IDs
    if (cohortIds.has(rawCohort.id)) {
      throw new ValidationError(`Duplicate cohort ID: "${rawCohort.id}".`);
    }
    cohortIds.add(rawCohort.id);

    // Merge base stages with cohort overrides
    const mergedRaw = mergeStages(rawStudy.stages, rawCohort.stages, rawCohort.id);

    // Resolve stages (load content, hash files, convert durations)
    const stages = resolveStages(mergedRaw, absDir, rawCohort.id);

    // Validate: if any stage has chatbot, cohort or stage must have provider/model
    const chatbotStages = stages.filter((s) => s.chatbot);
    if (chatbotStages.length > 0 && !rawCohort.provider) {
      // Check if all chatbot stages have their own provider
      const mergedRawMap = new Map(mergedRaw.map((s) => [s.id, s]));
      for (const cs of chatbotStages) {
        const rawStage = mergedRawMap.get(cs.stageId);
        if (!rawStage?.provider) {
          throw new ValidationError(
            `Cohort "${rawCohort.id}": stage "${cs.stageId}" has chatbot enabled but ` +
            `neither the cohort nor the stage has a 'provider' specified.`
          );
        }
      }
    }

    cohorts.push({
      cohortId: rawCohort.id,
      label: rawCohort.label,
      provider: rawCohort.provider ?? null,
      model: rawCohort.model ?? null,
      fallbackProvider: rawCohort.fallback?.provider ?? null,
      fallbackModel: rawCohort.fallback?.model ?? null,
      stages,
    });
  }

  return {
    studyId: rawStudy.id,
    title: rawStudy.title,
    description: rawStudy.description ?? null,
    cohorts,
    sourceDir: absDir,
  };
}
