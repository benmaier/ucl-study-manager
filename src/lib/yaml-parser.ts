import { readFileSync, existsSync } from "fs";
import { resolve, join, dirname } from "path";
import { createHash } from "crypto";
import { parse as parseYaml } from "yaml";
import type {
  RawStudyYaml,
  RawCohortYaml,
  RawFlowYaml,
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

function parseFlow(flowPath: string, studyDir: string, cohortId: string): ParsedStage[] {
  const raw = readYaml<RawFlowYaml>(flowPath);

  if (!Array.isArray(raw.stages) || raw.stages.length === 0) {
    throw new ValidationError(`Flow "${flowPath}" must have at least one stage.`);
  }

  // Validate unique stage IDs within this flow
  const stageIds = new Set<string>();
  for (const s of raw.stages) {
    if (!s.id) throw new ValidationError(`Flow "${flowPath}": every stage must have an 'id'.`);
    if (!s.title) throw new ValidationError(`Flow "${flowPath}": stage "${s.id}" must have a 'title'.`);
    if (!s.duration) throw new ValidationError(`Flow "${flowPath}": stage "${s.id}" must have a 'duration'.`);
    if (stageIds.has(s.id)) {
      throw new ValidationError(`Flow "${flowPath}": duplicate stage ID "${s.id}".`);
    }
    stageIds.add(s.id);
  }

  return raw.stages.map((s, index) => {
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

    // Validate link
    if (s.link && (!s.link.label || !s.link.url)) {
      throw new ValidationError(
        `Cohort "${cohortId}", stage "${s.id}": link must have both "label" and "url".`
      );
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
      link: s.link ? { label: s.link.label, url: s.link.url } : null,
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
 * Parse a study directory with the 3-level hierarchy:
 * study.yaml → cohort YAMLs → flow YAMLs → MD + task files
 *
 * All paths in YAMLs are relative to the study directory (where study.yaml lives).
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
  const rawStudy = readYaml<RawStudyYaml>(studyYamlPath);

  if (!rawStudy.title) {
    throw new ValidationError("study.yaml must have a 'title' field.");
  }
  if (!Array.isArray(rawStudy.cohorts) || rawStudy.cohorts.length === 0) {
    throw new ValidationError("study.yaml must list at least one cohort.");
  }

  // Parse each cohort
  const cohortIds = new Set<string>();
  const cohorts: ParsedCohort[] = [];

  for (const cohortRef of rawStudy.cohorts) {
    const cohortPath = join(absDir, cohortRef);
    const rawCohort = readYaml<RawCohortYaml>(cohortPath);

    // Validate required fields
    if (!rawCohort.id) throw new ValidationError(`Cohort at "${cohortRef}": must have an 'id'.`);
    if (!rawCohort.label) throw new ValidationError(`Cohort "${rawCohort.id}": must have a 'label'.`);
    if (typeof rawCohort.ai_access !== "boolean") {
      throw new ValidationError(`Cohort "${rawCohort.id}": 'ai_access' must be true or false.`);
    }
    if (typeof rawCohort.ai_training !== "boolean") {
      throw new ValidationError(`Cohort "${rawCohort.id}": 'ai_training' must be true or false.`);
    }
    if (!rawCohort.study_flow) {
      throw new ValidationError(`Cohort "${rawCohort.id}": must have a 'study_flow' path.`);
    }

    // Validate AI access ↔ provider consistency
    if (rawCohort.ai_access && !rawCohort.provider) {
      throw new ValidationError(
        `Cohort "${rawCohort.id}": ai_access is true but no 'provider' specified.`
      );
    }
    if (rawCohort.ai_access && !rawCohort.model) {
      throw new ValidationError(
        `Cohort "${rawCohort.id}": ai_access is true but no 'model' specified.`
      );
    }
    if (!rawCohort.ai_access && rawCohort.provider) {
      throw new ValidationError(
        `Cohort "${rawCohort.id}": ai_access is false but 'provider' is set. Remove it or set ai_access to true.`
      );
    }

    // Unique cohort IDs
    if (cohortIds.has(rawCohort.id)) {
      throw new ValidationError(`Duplicate cohort ID: "${rawCohort.id}".`);
    }
    cohortIds.add(rawCohort.id);

    // Parse the flow
    const flowPath = join(absDir, rawCohort.study_flow);
    const stages = parseFlow(flowPath, absDir, rawCohort.id);

    // Warn if chatbot: true on stages but cohort has no AI access
    if (!rawCohort.ai_access) {
      const chatbotStages = stages.filter((s) => s.chatbot);
      if (chatbotStages.length > 0) {
        console.warn(
          `Warning: Cohort "${rawCohort.id}" has ai_access=false but flow has chatbot stages: ${chatbotStages.map((s) => s.stageId).join(", ")}. Chatbot will not be shown.`
        );
      }
    }

    cohorts.push({
      cohortId: rawCohort.id,
      label: rawCohort.label,
      aiAccess: rawCohort.ai_access,
      aiTraining: rawCohort.ai_training,
      provider: rawCohort.provider ?? null,
      model: rawCohort.model ?? null,
      fallbackProvider: rawCohort.fallback?.provider ?? null,
      fallbackModel: rawCohort.fallback?.model ?? null,
      studyFlowRef: rawCohort.study_flow,
      stages,
    });
  }

  return {
    title: rawStudy.title,
    description: rawStudy.description ?? null,
    fallbackProvider: rawStudy.fallback?.provider ?? null,
    fallbackModel: rawStudy.fallback?.model ?? null,
    cohorts,
    sourceDir: absDir,
  };
}
