// ── Raw YAML types (direct mapping of file contents) ──

/** study.yaml — top-level entry point */
export interface RawStudyYaml {
  title: string;
  description?: string;
  fallback?: {
    provider: string;
    model: string;
  };
  cohorts: string[]; // relative paths to cohort YAML files
}

/** cohorts/*.yaml — cohort definition */
export interface RawCohortYaml {
  id: string;
  label: string;
  ai_access: boolean;
  ai_training: boolean;
  provider?: string;
  model?: string;
  fallback?: {
    provider: string;
    model: string;
  };
  study_flow: string; // relative path to flow YAML
}

/** flows/*.yaml — study flow (stages) */
export interface RawFlowYaml {
  stages: RawStage[];
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
  title: string;
  description: string | null;
  fallbackProvider: string | null;
  fallbackModel: string | null;
  cohorts: ParsedCohort[];
  sourceDir: string;
}

export interface ParsedCohort {
  cohortId: string;
  label: string;
  aiAccess: boolean;
  aiTraining: boolean;
  provider: string | null;
  model: string | null;
  fallbackProvider: string | null;
  fallbackModel: string | null;
  studyFlowRef: string;
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
