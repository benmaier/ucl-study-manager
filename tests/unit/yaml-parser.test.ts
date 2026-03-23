import { describe, it, expect } from "vitest";
import { resolve } from "path";
import { parseDuration, parseStudyYaml } from "../../src/lib/yaml-parser.js";

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

describe("parseStudyYaml", () => {
  it("parses the example study successfully", () => {
    const study = parseStudyYaml(EXAMPLE_STUDY);
    expect(study.title).toBe("Code Assistance Study");
    expect(study.description).toBe("Comparing LLM-assisted coding across providers");
    expect(study.fallbackProvider).toBe("openai");
    expect(study.fallbackModel).toBe("gpt-4o");
    expect(study.cohorts).toHaveLength(4);
  });

  it("parses cohort attributes correctly", () => {
    const study = parseStudyYaml(EXAMPLE_STUDY);

    const aiTrained = study.cohorts.find((c) => c.cohortId === "ai_trained");
    expect(aiTrained).toBeDefined();
    expect(aiTrained!.aiAccess).toBe(true);
    expect(aiTrained!.aiTraining).toBe(true);
    expect(aiTrained!.provider).toBe("anthropic");
    expect(aiTrained!.model).toBe("claude-sonnet-4-20250514");
    expect(aiTrained!.fallbackProvider).toBe("openai");

    const noAi = study.cohorts.find((c) => c.cohortId === "no_ai_untrained");
    expect(noAi).toBeDefined();
    expect(noAi!.aiAccess).toBe(false);
    expect(noAi!.aiTraining).toBe(false);
    expect(noAi!.provider).toBeNull();
    expect(noAi!.model).toBeNull();
  });

  it("parses stages with correct order and duration", () => {
    const study = parseStudyYaml(EXAMPLE_STUDY);
    const aiTrained = study.cohorts.find((c) => c.cohortId === "ai_trained")!;

    expect(aiTrained.stages).toHaveLength(4);
    expect(aiTrained.stages[0].stageId).toBe("intro");
    expect(aiTrained.stages[0].durationSeconds).toBe(600); // 10:00
    expect(aiTrained.stages[0].order).toBe(0);

    expect(aiTrained.stages[1].stageId).toBe("ai_training");
    expect(aiTrained.stages[1].durationSeconds).toBe(900); // 15:00
    expect(aiTrained.stages[1].order).toBe(1);
  });

  it("parses chatbot flag", () => {
    const study = parseStudyYaml(EXAMPLE_STUDY);
    const aiTrained = study.cohorts.find((c) => c.cohortId === "ai_trained")!;

    expect(aiTrained.stages[0].chatbot).toBe(false); // intro
    expect(aiTrained.stages[1].chatbot).toBe(true);  // ai_training
    expect(aiTrained.stages[2].chatbot).toBe(true);  // task1
    expect(aiTrained.stages[3].chatbot).toBe(false); // survey
  });

  it("parses stage files with descriptions and SHA-256 hashes", () => {
    const study = parseStudyYaml(EXAMPLE_STUDY);
    const aiTrained = study.cohorts.find((c) => c.cohortId === "ai_trained")!;
    const task1 = aiTrained.stages.find((s) => s.stageId === "task1")!;

    expect(task1.files).toHaveLength(2);
    expect(task1.files[0].filename).toBe("files/data.csv");
    expect(task1.files[0].description).toContain("Student enrollment");
    expect(task1.files[0].sha256).toMatch(/^[a-f0-9]{64}$/);

    expect(task1.files[1].filename).toBe("files/template.py");
    expect(task1.files[1].sha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it("parses questions, input, link, and confirmation", () => {
    const study = parseStudyYaml(EXAMPLE_STUDY);
    const aiTrained = study.cohorts.find((c) => c.cohortId === "ai_trained")!;

    // task1 has questions + input + confirmation
    const task1 = aiTrained.stages.find((s) => s.stageId === "task1")!;
    expect(task1.questions).toHaveLength(3);
    expect(task1.questions[0]).toContain("relevant");
    expect(task1.input).not.toBeNull();
    expect(task1.input!.label).toBe("Your result");
    expect(task1.input!.prompt).toContain("Explain why");
    expect(task1.confirmation).toContain("final answer");

    // survey has link + confirmation, no input
    const survey = aiTrained.stages.find((s) => s.stageId === "survey")!;
    expect(survey.link).not.toBeNull();
    expect(survey.link!.label).toBe("Open the survey");
    expect(survey.link!.url).toContain("example.com");
    expect(survey.input).toBeNull();
    expect(survey.confirmation).toContain("completed the survey");
  });

  it("loads markdown content from files", () => {
    const study = parseStudyYaml(EXAMPLE_STUDY);
    const aiTrained = study.cohorts.find((c) => c.cohortId === "ai_trained")!;
    const intro = aiTrained.stages[0];

    expect(intro.contentText).not.toBeNull();
    expect(intro.contentText).toContain("Welcome to the Code Assistance Study");
    expect(intro.contentRef).toBe("content/intro.md");
  });

  it("shared flows produce identical stages for different cohorts", () => {
    const study = parseStudyYaml(EXAMPLE_STUDY);
    // ai_untrained and no_ai_untrained both use flows/standard.yaml
    const aiUntrained = study.cohorts.find((c) => c.cohortId === "ai_untrained")!;
    const noAiUntrained = study.cohorts.find((c) => c.cohortId === "no_ai_untrained")!;

    expect(aiUntrained.stages).toHaveLength(noAiUntrained.stages.length);
    for (let i = 0; i < aiUntrained.stages.length; i++) {
      expect(aiUntrained.stages[i].stageId).toBe(noAiUntrained.stages[i].stageId);
      expect(aiUntrained.stages[i].durationSeconds).toBe(noAiUntrained.stages[i].durationSeconds);
    }
  });

  it("throws on nonexistent directory", () => {
    expect(() => parseStudyYaml("/nonexistent/path")).toThrow("does not exist");
  });

  it("throws on directory without study.yaml", () => {
    expect(() => parseStudyYaml("/tmp")).toThrow("No study.yaml found");
  });
});
