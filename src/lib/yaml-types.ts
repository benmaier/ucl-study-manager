// ── Raw YAML types (direct mapping of file contents) ──

/** study.yaml — top-level entry point with inline base stages */
export interface RawStudyYaml {
  id: string;
  title: string;
  description?: string;
  stages: RawStage[]; // base flow, inline
  // cohorts auto-discovered from cohorts/ subdirectory
}

/** cohorts/*.yaml — cohort definition with optional stage overrides */
export interface RawCohortYaml {
  id: string;
  label: string;
  provider?: string;
  model?: string;
  fallback?: {
    provider: string;
    model: string;
  };
  stages?: RawCohortStageOverride[]; // overrides/additions/skips relative to base
}

/** A stage entry in a cohort YAML — can override, add, or skip a stage */
export interface RawCohortStageOverride {
  id: string;
  skip?: boolean;

  // Insertion position for new stages (required if id not in base flow)
  after?: string;
  before?: string;

  // All RawStage fields are optional (only specified fields override base)
  title?: string;
  duration?: string;
  content?: string;
  chatbot?: boolean;
  provider?: string;  // stage-level override of cohort default
  model?: string;
  files?: (string | RawStageFile)[];
  questions?: string[];
  input?: { label: string; prompt?: string } | null;
  link?: { label: string; url: string } | null;
  confirmation?: string | null;
  sidebar_panels?: { title: string; content: string; defaultExpanded?: boolean }[] | null;
}

export interface RawStageFile {
  filename: string;
  description?: string;
}

export interface RawStage {
  id: string;
  title: string;
  duration: string; // "MM:SS"
  content?: string; // relative path to MD file
  chatbot?: boolean;
  provider?: string;  // stage-level provider override
  model?: string;     // stage-level model override
  files?: (string | RawStageFile)[];
  questions?: string[];
  input?: {
    label: string;
    prompt?: string;
  };
  link?: {
    label: string;
    url: string;
  };
  confirmation?: string;
  sidebar_panels?: { title: string; content: string; defaultExpanded?: boolean }[];
}

// ── Parsed & validated types (ready for DB import) ──

export interface ParsedStudy {
  studyId: string;
  title: string;
  description: string | null;
  cohorts: ParsedCohort[];
  sourceDir: string;
}

export interface ParsedCohort {
  cohortId: string;
  label: string;
  provider: string | null;
  model: string | null;
  fallbackProvider: string | null;
  fallbackModel: string | null;
  stages: ParsedStage[];
}

export interface ParsedStage {
  stageId: string;
  title: string;
  durationSeconds: number;
  order: number;
  contentRef: string | null;
  contentText: string | null;
  chatbot: boolean;
  files: ParsedStageFile[];
  questions: string[];
  input: { label: string; prompt: string | null } | null;
  link: { label: string; url: string } | null;
  confirmation: string | null;
  sidebarPanels: { title: string; content: string; defaultExpanded?: boolean }[];
}

export interface ParsedStageFile {
  filename: string;
  description: string | null;
  sha256: string;
}
