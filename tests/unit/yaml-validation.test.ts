import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdirSync, writeFileSync, rmSync } from "fs";
import { join } from "path";
import { parseStudyYaml } from "../../src/lib/yaml-parser.js";

const FIXTURES_DIR = join("/tmp", "ucl-test-fixtures");

function writeFile(absolutePath: string, content: string) {
  const dir = absolutePath.substring(0, absolutePath.lastIndexOf("/"));
  mkdirSync(dir, { recursive: true });
  writeFileSync(absolutePath, content);
}

function makeMinimalStudy(overrides?: {
  studyYaml?: string;
  cohortYaml?: string;
  flowYaml?: string;
}) {
  const dir = join(FIXTURES_DIR, `study-${Date.now()}-${Math.random().toString(36).slice(2)}`);

  writeFile(
    join(dir, "study.yaml"),
    overrides?.studyYaml ??
      'title: "Test"\ncohorts:\n  - cohorts/c1.yaml\n'
  );

  writeFile(
    join(dir, "cohorts/c1.yaml"),
    overrides?.cohortYaml ??
      'id: c1\nlabel: "C1"\nai_access: false\nai_training: false\nstudy_flow: flows/f1.yaml\n'
  );

  writeFile(
    join(dir, "flows/f1.yaml"),
    overrides?.flowYaml ??
      'stages:\n  - id: s1\n    title: "S1"\n    duration: "1:00"\n'
  );

  return dir;
}

beforeAll(() => {
  mkdirSync(FIXTURES_DIR, { recursive: true });
});

afterAll(() => {
  rmSync(FIXTURES_DIR, { recursive: true, force: true });
});

describe("YAML validation: study.yaml", () => {
  it("rejects missing title", () => {
    const dir = makeMinimalStudy({
      studyYaml: 'cohorts:\n  - cohorts/c1.yaml\n',
    });
    expect(() => parseStudyYaml(dir)).toThrow("title");
  });

  it("rejects empty cohorts list", () => {
    const dir = makeMinimalStudy({
      studyYaml: 'title: "Test"\ncohorts: []\n',
    });
    expect(() => parseStudyYaml(dir)).toThrow("at least one cohort");
  });

  it("rejects missing cohorts field", () => {
    const dir = makeMinimalStudy({
      studyYaml: 'title: "Test"\n',
    });
    expect(() => parseStudyYaml(dir)).toThrow("at least one cohort");
  });
});

describe("YAML validation: cohort", () => {
  it("rejects cohort without id", () => {
    const dir = makeMinimalStudy({
      cohortYaml: 'label: "C1"\nai_access: false\nai_training: false\nstudy_flow: flows/f1.yaml\n',
    });
    expect(() => parseStudyYaml(dir)).toThrow("must have an 'id'");
  });

  it("rejects cohort without label", () => {
    const dir = makeMinimalStudy({
      cohortYaml: 'id: c1\nai_access: false\nai_training: false\nstudy_flow: flows/f1.yaml\n',
    });
    expect(() => parseStudyYaml(dir)).toThrow("must have a 'label'");
  });

  it("rejects ai_access: true without provider", () => {
    const dir = makeMinimalStudy({
      cohortYaml: 'id: c1\nlabel: "C1"\nai_access: true\nai_training: false\nstudy_flow: flows/f1.yaml\n',
    });
    expect(() => parseStudyYaml(dir)).toThrow("no 'provider' specified");
  });

  it("rejects ai_access: true without model", () => {
    const dir = makeMinimalStudy({
      cohortYaml:
        'id: c1\nlabel: "C1"\nai_access: true\nai_training: false\nprovider: anthropic\nstudy_flow: flows/f1.yaml\n',
    });
    expect(() => parseStudyYaml(dir)).toThrow("no 'model' specified");
  });

  it("rejects ai_access: false with provider set", () => {
    const dir = makeMinimalStudy({
      cohortYaml:
        'id: c1\nlabel: "C1"\nai_access: false\nai_training: false\nprovider: anthropic\nstudy_flow: flows/f1.yaml\n',
    });
    expect(() => parseStudyYaml(dir)).toThrow("ai_access is false but 'provider' is set");
  });

  it("rejects missing study_flow", () => {
    const dir = makeMinimalStudy({
      cohortYaml: 'id: c1\nlabel: "C1"\nai_access: false\nai_training: false\n',
    });
    expect(() => parseStudyYaml(dir)).toThrow("must have a 'study_flow' path");
  });

  it("rejects nonexistent flow file", () => {
    const dir = makeMinimalStudy({
      cohortYaml:
        'id: c1\nlabel: "C1"\nai_access: false\nai_training: false\nstudy_flow: flows/nonexistent.yaml\n',
    });
    expect(() => parseStudyYaml(dir)).toThrow("File not found");
  });
});

describe("YAML validation: flow/stages", () => {
  it("rejects empty stages", () => {
    const dir = makeMinimalStudy({
      flowYaml: "stages: []\n",
    });
    expect(() => parseStudyYaml(dir)).toThrow("at least one stage");
  });

  it("rejects stage without id", () => {
    const dir = makeMinimalStudy({
      flowYaml: 'stages:\n  - title: "S1"\n    duration: "1:00"\n',
    });
    expect(() => parseStudyYaml(dir)).toThrow("must have an 'id'");
  });

  it("rejects stage without title", () => {
    const dir = makeMinimalStudy({
      flowYaml: 'stages:\n  - id: s1\n    duration: "1:00"\n',
    });
    expect(() => parseStudyYaml(dir)).toThrow("must have a 'title'");
  });

  it("rejects stage without duration", () => {
    const dir = makeMinimalStudy({
      flowYaml: 'stages:\n  - id: s1\n    title: "S1"\n',
    });
    expect(() => parseStudyYaml(dir)).toThrow("must have a 'duration'");
  });

  it("rejects duplicate stage IDs", () => {
    const dir = makeMinimalStudy({
      flowYaml:
        'stages:\n  - id: s1\n    title: "A"\n    duration: "1:00"\n  - id: s1\n    title: "B"\n    duration: "2:00"\n',
    });
    expect(() => parseStudyYaml(dir)).toThrow("duplicate stage ID");
  });

  it("rejects nonexistent content file", () => {
    const dir = makeMinimalStudy({
      flowYaml:
        'stages:\n  - id: s1\n    title: "S1"\n    duration: "1:00"\n    content: content/missing.md\n',
    });
    expect(() => parseStudyYaml(dir)).toThrow("not found");
  });

  it("rejects nonexistent stage file", () => {
    const dir = makeMinimalStudy({
      flowYaml:
        'stages:\n  - id: s1\n    title: "S1"\n    duration: "1:00"\n    files:\n      - missing.csv\n',
    });
    expect(() => parseStudyYaml(dir)).toThrow("not found");
  });

  it("rejects link with missing url", () => {
    const dir = makeMinimalStudy({
      flowYaml:
        'stages:\n  - id: s1\n    title: "S1"\n    duration: "1:00"\n    link:\n      label: "Click"\n',
    });
    expect(() => parseStudyYaml(dir)).toThrow('must have both "label" and "url"');
  });

  it("accepts a valid minimal flow", () => {
    const dir = makeMinimalStudy();
    const study = parseStudyYaml(dir);
    expect(study.cohorts[0].stages).toHaveLength(1);
    expect(study.cohorts[0].stages[0].stageId).toBe("s1");
    expect(study.cohorts[0].stages[0].durationSeconds).toBe(60);
  });
});

describe("YAML validation: duplicate cohort IDs", () => {
  it("rejects duplicate cohort IDs across files", () => {
    const dir = join(FIXTURES_DIR, `dup-cohort-${Date.now()}`);
    writeFile(
      join(dir, "study.yaml"),
      'title: "Test"\ncohorts:\n  - cohorts/c1.yaml\n  - cohorts/c2.yaml\n'
    );
    writeFile(
      join(dir, "cohorts/c1.yaml"),
      'id: same_id\nlabel: "A"\nai_access: false\nai_training: false\nstudy_flow: flows/f1.yaml\n'
    );
    writeFile(
      join(dir, "cohorts/c2.yaml"),
      'id: same_id\nlabel: "B"\nai_access: false\nai_training: false\nstudy_flow: flows/f1.yaml\n'
    );
    writeFile(
      join(dir, "flows/f1.yaml"),
      'stages:\n  - id: s1\n    title: "S1"\n    duration: "1:00"\n'
    );
    expect(() => parseStudyYaml(dir)).toThrow('Duplicate cohort ID: "same_id"');
  });
});
