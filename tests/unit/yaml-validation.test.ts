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
  cohortFilename?: string;
}) {
  const dir = join(FIXTURES_DIR, `study-${Date.now()}-${Math.random().toString(36).slice(2)}`);

  writeFile(
    join(dir, "study.yaml"),
    overrides?.studyYaml ??
      'id: test\ntitle: "Test"\nstages:\n  - id: s1\n    title: "S1"\n    duration: "1:00"\n'
  );

  writeFile(
    join(dir, `cohorts/${overrides?.cohortFilename ?? "c1.yaml"}`),
    overrides?.cohortYaml ??
      'id: c1\nlabel: "C1"\n'
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
      studyYaml: 'id: test\nstages:\n  - id: s1\n    title: "S1"\n    duration: "1:00"\n',
    });
    expect(() => parseStudyYaml(dir)).toThrow("title");
  });

  it("rejects empty stages list", () => {
    const dir = makeMinimalStudy({
      studyYaml: 'id: test\ntitle: "Test"\nstages: []\n',
    });
    expect(() => parseStudyYaml(dir)).toThrow("at least one stage");
  });

  it("rejects missing stages field", () => {
    const dir = makeMinimalStudy({
      studyYaml: 'id: test\ntitle: "Test"\n',
    });
    expect(() => parseStudyYaml(dir)).toThrow("at least one stage");
  });

  it("rejects old cohorts list format", () => {
    const dir = makeMinimalStudy({
      studyYaml: 'id: test\ntitle: "Test"\ncohorts:\n  - cohorts/c1.yaml\n',
    });
    expect(() => parseStudyYaml(dir)).toThrow("old format is no longer supported");
  });
});

describe("YAML validation: cohort", () => {
  it("rejects cohort without id", () => {
    const dir = makeMinimalStudy({
      cohortYaml: 'label: "C1"\n',
    });
    expect(() => parseStudyYaml(dir)).toThrow("must have an 'id'");
  });

  it("rejects cohort without label", () => {
    const dir = makeMinimalStudy({
      cohortYaml: 'id: c1\n',
    });
    expect(() => parseStudyYaml(dir)).toThrow("must have a 'label'");
  });

  it("rejects old study_flow field", () => {
    const dir = makeMinimalStudy({
      cohortYaml: 'id: c1\nlabel: "C1"\nstudy_flow: flows/f1.yaml\n',
    });
    expect(() => parseStudyYaml(dir)).toThrow("old 'study_flow' field");
  });

  it("rejects old ai_access field", () => {
    const dir = makeMinimalStudy({
      cohortYaml: 'id: c1\nlabel: "C1"\nai_access: true\n',
    });
    expect(() => parseStudyYaml(dir)).toThrow("old 'ai_access' field");
  });

  it("requires provider when chatbot stage exists", () => {
    const dir = makeMinimalStudy({
      cohortYaml: 'id: c1\nlabel: "C1"\nstages:\n  - id: s1\n    chatbot: true\n',
    });
    expect(() => parseStudyYaml(dir)).toThrow("provider");
  });
});

describe("YAML validation: base stages", () => {
  it("rejects stage without id", () => {
    const dir = makeMinimalStudy({
      studyYaml: 'id: test\ntitle: "Test"\nstages:\n  - title: "S1"\n    duration: "1:00"\n',
    });
    expect(() => parseStudyYaml(dir)).toThrow("must have an 'id'");
  });

  it("rejects stage without title", () => {
    const dir = makeMinimalStudy({
      studyYaml: 'id: test\ntitle: "Test"\nstages:\n  - id: s1\n    duration: "1:00"\n',
    });
    expect(() => parseStudyYaml(dir)).toThrow("must have a 'title'");
  });

  it("rejects stage without duration", () => {
    const dir = makeMinimalStudy({
      studyYaml: 'id: test\ntitle: "Test"\nstages:\n  - id: s1\n    title: "S1"\n',
    });
    expect(() => parseStudyYaml(dir)).toThrow("must have a 'duration'");
  });

  it("rejects duplicate stage IDs", () => {
    const dir = makeMinimalStudy({
      studyYaml:
        'id: test\ntitle: "Test"\nstages:\n  - id: s1\n    title: "A"\n    duration: "1:00"\n  - id: s1\n    title: "B"\n    duration: "2:00"\n',
    });
    expect(() => parseStudyYaml(dir)).toThrow("duplicate stage ID");
  });

  it("rejects nonexistent content file", () => {
    const dir = makeMinimalStudy({
      studyYaml:
        'id: test\ntitle: "Test"\nstages:\n  - id: s1\n    title: "S1"\n    duration: "1:00"\n    content: content/missing.md\n',
    });
    expect(() => parseStudyYaml(dir)).toThrow("not found");
  });

  it("accepts a valid minimal study", () => {
    const dir = makeMinimalStudy();
    const study = parseStudyYaml(dir);
    expect(study.cohorts[0].stages).toHaveLength(1);
    expect(study.cohorts[0].stages[0].stageId).toBe("s1");
    expect(study.cohorts[0].stages[0].durationSeconds).toBe(60);
  });
});

describe("YAML validation: cohort stage overrides", () => {
  it("rejects skip of unknown stage", () => {
    const dir = makeMinimalStudy({
      cohortYaml: 'id: c1\nlabel: "C1"\nstages:\n  - id: unknown\n    skip: true\n',
    });
    expect(() => parseStudyYaml(dir)).toThrow("cannot skip stage");
  });

  it("rejects new stage without after/before", () => {
    const dir = makeMinimalStudy({
      cohortYaml: 'id: c1\nlabel: "C1"\nstages:\n  - id: new_stage\n    title: "New"\n    duration: "1:00"\n',
    });
    expect(() => parseStudyYaml(dir)).toThrow("must specify 'after' or 'before'");
  });

  it("rejects new stage with both after and before", () => {
    const dir = makeMinimalStudy({
      cohortYaml: 'id: c1\nlabel: "C1"\nstages:\n  - id: new_stage\n    title: "New"\n    duration: "1:00"\n    after: s1\n    before: s1\n',
    });
    expect(() => parseStudyYaml(dir)).toThrow("cannot specify both");
  });

  it("rejects repositioning a base stage with after/before", () => {
    const dir = makeMinimalStudy({
      studyYaml: 'id: test\ntitle: "Test"\nstages:\n  - id: s1\n    title: "A"\n    duration: "1:00"\n  - id: s2\n    title: "B"\n    duration: "1:00"\n',
      cohortYaml: 'id: c1\nlabel: "C1"\nstages:\n  - id: s1\n    after: s2\n',
    });
    expect(() => parseStudyYaml(dir)).toThrow("cannot use 'after'/'before' on a base flow stage");
  });

  it("rejects new stage referencing unknown anchor", () => {
    const dir = makeMinimalStudy({
      cohortYaml: 'id: c1\nlabel: "C1"\nstages:\n  - id: new_stage\n    title: "New"\n    duration: "1:00"\n    after: nonexistent\n',
    });
    expect(() => parseStudyYaml(dir)).toThrow("references unknown stage");
  });

  it("rejects new stage without title", () => {
    const dir = makeMinimalStudy({
      cohortYaml: 'id: c1\nlabel: "C1"\nstages:\n  - id: new_stage\n    duration: "1:00"\n    after: s1\n',
    });
    expect(() => parseStudyYaml(dir)).toThrow("must have a 'title'");
  });

  it("rejects new stage without duration", () => {
    const dir = makeMinimalStudy({
      cohortYaml: 'id: c1\nlabel: "C1"\nstages:\n  - id: new_stage\n    title: "New"\n    after: s1\n',
    });
    expect(() => parseStudyYaml(dir)).toThrow("must have a 'duration'");
  });

  it("rejects duplicate override IDs", () => {
    const dir = makeMinimalStudy({
      cohortYaml: 'id: c1\nlabel: "C1"\nstages:\n  - id: s1\n    chatbot: true\n  - id: s1\n    chatbot: false\n',
    });
    expect(() => parseStudyYaml(dir)).toThrow("duplicate stage override ID");
  });
});

describe("YAML validation: duplicate cohort IDs", () => {
  it("rejects duplicate cohort IDs across files", () => {
    const dir = join(FIXTURES_DIR, `dup-cohort-${Date.now()}`);
    writeFile(
      join(dir, "study.yaml"),
      'id: test\ntitle: "Test"\nstages:\n  - id: s1\n    title: "S1"\n    duration: "1:00"\n'
    );
    writeFile(
      join(dir, "cohorts/c1.yaml"),
      'id: same_id\nlabel: "A"\n'
    );
    writeFile(
      join(dir, "cohorts/c2.yaml"),
      'id: same_id\nlabel: "B"\n'
    );
    expect(() => parseStudyYaml(dir)).toThrow('Duplicate cohort ID: "same_id"');
  });
});
