import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdirSync, writeFileSync, rmSync } from "fs";
import { join, resolve } from "path";
import { parseDuration, parseStudyYaml, mergeStages } from "../../src/lib/yaml-parser.js";
import type { RawStage, RawCohortStageOverride } from "../../src/lib/yaml-types.js";

const EXAMPLE_STUDY = resolve("studies/example");

describe("parseDuration", () => {
  it("parses MM:SS correctly", () => {
    expect(parseDuration("5:00")).toBe(300);
    expect(parseDuration("30:00")).toBe(1800);
    expect(parseDuration("1:30")).toBe(90);
    expect(parseDuration("0:05")).toBe(5);
    expect(parseDuration("0:00")).toBe(0);
    expect(parseDuration("120:00")).toBe(7200);
  });

  it("rejects invalid formats", () => {
    expect(() => parseDuration("5")).toThrow("Invalid duration format");
    expect(() => parseDuration("5:0")).toThrow("Invalid duration format");
    expect(() => parseDuration("abc")).toThrow("Invalid duration format");
    expect(() => parseDuration("")).toThrow("Invalid duration format");
    expect(() => parseDuration(":00")).toThrow("Invalid duration format");
    expect(() => parseDuration("5:000")).toThrow("Invalid duration format");
  });

  it("rejects seconds >= 60", () => {
    expect(() => parseDuration("5:60")).toThrow("Seconds must be 0-59");
    expect(() => parseDuration("5:99")).toThrow("Seconds must be 0-59");
  });
});

describe("mergeStages", () => {
  const base: RawStage[] = [
    { id: "intro", title: "Intro", duration: "5:00" },
    { id: "task1", title: "Task 1", duration: "30:00", chatbot: false },
    { id: "end", title: "End", duration: "2:00" },
  ];

  it("returns deep copy when no overrides", () => {
    const result = mergeStages(base, undefined, "test");
    expect(result).toHaveLength(3);
    expect(result[0].id).toBe("intro");
    // Verify it's a deep copy
    result[0].title = "Modified";
    expect(base[0].title).toBe("Intro");
  });

  it("applies field override to existing stage", () => {
    const overrides: RawCohortStageOverride[] = [
      { id: "task1", chatbot: true },
    ];
    const result = mergeStages(base, overrides, "test");
    expect(result).toHaveLength(3);
    const task1 = result.find((s) => s.id === "task1")!;
    expect(task1.chatbot).toBe(true);
    expect(task1.title).toBe("Task 1"); // inherited
  });

  it("skips a base stage", () => {
    const overrides: RawCohortStageOverride[] = [
      { id: "task1", skip: true },
    ];
    const result = mergeStages(base, overrides, "test");
    expect(result).toHaveLength(2);
    expect(result.map((s) => s.id)).toEqual(["intro", "end"]);
  });

  it("adds new stage with after", () => {
    const overrides: RawCohortStageOverride[] = [
      { id: "training", title: "Training", duration: "10:00", after: "intro" },
    ];
    const result = mergeStages(base, overrides, "test");
    expect(result).toHaveLength(4);
    expect(result.map((s) => s.id)).toEqual(["intro", "training", "task1", "end"]);
  });

  it("adds new stage with before", () => {
    const overrides: RawCohortStageOverride[] = [
      { id: "warmup", title: "Warmup", duration: "3:00", before: "task1" },
    ];
    const result = mergeStages(base, overrides, "test");
    expect(result).toHaveLength(4);
    expect(result.map((s) => s.id)).toEqual(["intro", "warmup", "task1", "end"]);
  });

  it("chains multiple additions", () => {
    const overrides: RawCohortStageOverride[] = [
      { id: "a", title: "A", duration: "1:00", after: "intro" },
      { id: "b", title: "B", duration: "1:00", after: "a" }, // references just-inserted stage
    ];
    const result = mergeStages(base, overrides, "test");
    expect(result.map((s) => s.id)).toEqual(["intro", "a", "b", "task1", "end"]);
  });

  it("removes field when override sets null", () => {
    const baseWithConfirm: RawStage[] = [
      { id: "s1", title: "S1", duration: "1:00", confirmation: "Confirm" },
    ];
    const overrides: RawCohortStageOverride[] = [
      { id: "s1", confirmation: null },
    ];
    const result = mergeStages(baseWithConfirm, overrides, "test");
    expect(result[0].confirmation).toBeUndefined();
  });

  it("replaces array fields entirely", () => {
    const baseWithQuestions: RawStage[] = [
      { id: "s1", title: "S1", duration: "1:00", questions: ["Q1", "Q2"] },
    ];
    const overrides: RawCohortStageOverride[] = [
      { id: "s1", questions: ["Q3"] },
    ];
    const result = mergeStages(baseWithQuestions, overrides, "test");
    expect(result[0].questions).toEqual(["Q3"]);
  });

  it("inherits code_to_progress from base stage", () => {
    const baseWithCode: RawStage[] = [
      { id: "s1", title: "S1", duration: "1:00", code_to_progress: "XYZ123" },
    ];
    const result = mergeStages(baseWithCode, undefined, "test");
    expect(result[0].code_to_progress).toBe("XYZ123");
  });

  it("cohort override can set code_to_progress on a base stage", () => {
    const base: RawStage[] = [
      { id: "s1", title: "S1", duration: "1:00" },
    ];
    const overrides: RawCohortStageOverride[] = [
      { id: "s1", code_to_progress: "ABC789" },
    ];
    const result = mergeStages(base, overrides, "test");
    expect(result[0].code_to_progress).toBe("ABC789");
  });

  it("cohort override can remove code_to_progress with null", () => {
    const baseWithCode: RawStage[] = [
      { id: "s1", title: "S1", duration: "1:00", code_to_progress: "XYZ123" },
    ];
    const overrides: RawCohortStageOverride[] = [
      { id: "s1", code_to_progress: null },
    ];
    const result = mergeStages(baseWithCode, overrides, "test");
    expect(result[0].code_to_progress).toBeUndefined();
  });
});

describe("parseStudyYaml (example study)", () => {
  it("parses the example study successfully", () => {
    const study = parseStudyYaml(EXAMPLE_STUDY);
    expect(study.studyId).toBe("ai_decision_making");
    expect(study.title).toBe("AI-Assisted Decision Making Study");
    expect(study.cohorts).toHaveLength(4);
  });

  it("auto-discovers cohorts from cohorts/ directory", () => {
    const study = parseStudyYaml(EXAMPLE_STUDY);
    const ids = study.cohorts.map((c) => c.cohortId).sort();
    expect(ids).toEqual(["anthropic_untrained", "gemini_trained", "no_ai_trained", "no_ai_untrained"]);
  });

  it("no_ai_untrained inherits base flow unchanged", () => {
    const study = parseStudyYaml(EXAMPLE_STUDY);
    const noAi = study.cohorts.find((c) => c.cohortId === "no_ai_untrained")!;
    expect(noAi.stages).toHaveLength(7);
    expect(noAi.stages.every((s) => !s.chatbot)).toBe(true);
    expect(noAi.provider).toBeNull();
  });

  it("gemini_trained adds ai_training stage and chatbot overrides", () => {
    const study = parseStudyYaml(EXAMPLE_STUDY);
    const gemini = study.cohorts.find((c) => c.cohortId === "gemini_trained")!;
    expect(gemini.stages).toHaveLength(8);
    expect(gemini.provider).toBe("gemini");
    expect(gemini.model).toBe("gemini-2.5-flash");

    // ai_training inserted after cognitive_test
    const stageIds = gemini.stages.map((s) => s.stageId);
    const ctIdx = stageIds.indexOf("cognitive_test");
    const atIdx = stageIds.indexOf("ai_training");
    expect(atIdx).toBe(ctIdx + 1);

    // Chatbot on training + tasks
    const chatStages = gemini.stages.filter((s) => s.chatbot).map((s) => s.stageId);
    expect(chatStages).toEqual(["ai_training", "task1", "task2"]);
  });

  it("anthropic_untrained has chatbot on tasks only", () => {
    const study = parseStudyYaml(EXAMPLE_STUDY);
    const anth = study.cohorts.find((c) => c.cohortId === "anthropic_untrained")!;
    expect(anth.stages).toHaveLength(7);
    expect(anth.provider).toBe("anthropic");

    const chatStages = anth.stages.filter((s) => s.chatbot).map((s) => s.stageId);
    expect(chatStages).toEqual(["task1", "task2"]);
  });

  it("no_ai_trained adds reading_material stage", () => {
    const study = parseStudyYaml(EXAMPLE_STUDY);
    const noAiTrained = study.cohorts.find((c) => c.cohortId === "no_ai_trained")!;
    expect(noAiTrained.stages).toHaveLength(8);

    const stageIds = noAiTrained.stages.map((s) => s.stageId);
    const ctIdx = stageIds.indexOf("cognitive_test");
    const rmIdx = stageIds.indexOf("reading_material");
    expect(rmIdx).toBe(ctIdx + 1);
    expect(noAiTrained.stages.every((s) => !s.chatbot)).toBe(true);
  });

  it("loads markdown content from files", () => {
    const study = parseStudyYaml(EXAMPLE_STUDY);
    const cohort = study.cohorts[0];
    const intro = cohort.stages[0];
    expect(intro.contentText).not.toBeNull();
    expect(intro.contentRef).toBe("content/intro.md");
  });

  it("parses stage files with SHA-256 hashes", () => {
    const study = parseStudyYaml(EXAMPLE_STUDY);
    const noAi = study.cohorts.find((c) => c.cohortId === "no_ai_untrained")!;
    const task1 = noAi.stages.find((s) => s.stageId === "task1")!;
    expect(task1.files).toHaveLength(3);
    expect(task1.files[0].sha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it("throws on nonexistent directory", () => {
    expect(() => parseStudyYaml("/nonexistent/path")).toThrow("does not exist");
  });

  it("throws on directory without study.yaml", () => {
    expect(() => parseStudyYaml("/tmp")).toThrow();
  });
});
