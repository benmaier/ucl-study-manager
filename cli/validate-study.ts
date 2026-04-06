import { parseStudyYaml } from "../src/lib/yaml-parser.js";
import { select } from "@inquirer/prompts";
import type { ParsedStudy, ParsedCohort, ParsedStage } from "../src/lib/yaml-types.js";

const studyDir = process.argv[2];

if (!studyDir) {
  console.error("Usage: npx tsx cli/validate-study.ts <path-to-study-dir>");
  process.exit(1);
}

// ── Validate ──

let study: ParsedStudy;
try {
  study = parseStudyYaml(studyDir);
} catch (err) {
  console.error(`\n\x1b[31m✗ Validation failed:\x1b[0m`);
  console.error(`  ${(err as Error).message}\n`);
  process.exit(1);
}

const totalStages = study.cohorts.reduce((n, c) => n + c.stages.length, 0);
console.log(`\n\x1b[32m✓\x1b[0m Study: "${study.title}" (${study.studyId})`);
console.log(`  ${study.cohorts.length} cohorts, ${totalStages} total stages\n`);

// Find max widths for alignment
const maxIdLen = Math.max(...study.cohorts.map((c) => c.cohortId.length));
const maxStageLen = Math.max(...study.cohorts.map((c) => String(c.stages.length).length));

for (const c of study.cohorts) {
  const chatStages = c.stages.filter((s) => s.chatbot).map((s) => s.stageId);
  const chatInfo = chatStages.length > 0
    ? `chatbot: ${chatStages.join(", ")}`
    : "no chatbot";
  const providerInfo = c.provider ? `  provider: ${c.provider}` : "";
  console.log(
    `  ${c.cohortId.padEnd(maxIdLen)}  ${String(c.stages.length).padStart(maxStageLen)} stages  (${chatInfo})${providerInfo}`
  );
}

// ── Interactive preview ──

console.log("");

async function previewCohort(cohort: ParsedCohort) {
  let stageIndex = 0;

  while (true) {
    const stage = cohort.stages[stageIndex];
    printStage(stage, stageIndex, cohort.stages.length, cohort);

    const choices: { name: string; value: string }[] = [];
    if (stageIndex < cohort.stages.length - 1) choices.push({ name: "Next stage →", value: "next" });
    if (stageIndex > 0) choices.push({ name: "← Previous stage", value: "prev" });
    choices.push({ name: "Jump to stage...", value: "jump" });
    choices.push({ name: "Switch cohort", value: "cohort" });
    choices.push({ name: "Quit", value: "quit" });

    const action = await select({ message: "Action:", choices });

    if (action === "next") {
      stageIndex++;
    } else if (action === "prev") {
      stageIndex--;
    } else if (action === "jump") {
      const target = await select({
        message: "Jump to:",
        choices: cohort.stages.map((s, i) => ({
          name: `${i + 1}. ${s.title} (${s.stageId})`,
          value: String(i),
        })),
      });
      stageIndex = parseInt(target, 10);
    } else if (action === "cohort") {
      return "cohort";
    } else {
      return "quit";
    }
  }
}

function printStage(stage: ParsedStage, index: number, total: number, cohort: ParsedCohort) {
  const divider = "─".repeat(70);
  console.log(`\n\x1b[90m${divider}\x1b[0m`);
  console.log(`\x1b[1m${stage.title}\x1b[0m  \x1b[90m(${stage.stageId})  ${index + 1}/${total}  ${formatDuration(stage.durationSeconds)}\x1b[0m`);
  if (stage.chatbot) {
    console.log(`\x1b[32m  ● AI chatbot enabled\x1b[0m`);
  }
  console.log("");

  // Content (truncated)
  if (stage.contentText) {
    const lines = stage.contentText.split("\n").slice(0, 15);
    for (const line of lines) {
      console.log(`  ${line}`);
    }
    if (stage.contentText.split("\n").length > 15) {
      console.log(`  \x1b[90m... (${stage.contentText.split("\n").length - 15} more lines)\x1b[0m`);
    }
    console.log("");
  }

  // Files
  if (stage.files.length > 0) {
    console.log("  \x1b[1mFiles:\x1b[0m");
    for (const f of stage.files) {
      const name = f.filename.split("/").pop();
      console.log(`    📎 ${name}${f.description ? ` — ${f.description}` : ""}`);
    }
    console.log("");
  }

  // Link
  if (stage.link) {
    console.log(`  \x1b[1mLink:\x1b[0m ${stage.link.label}`);
    console.log(`    \x1b[90m${stage.link.url}\x1b[0m`);
    console.log("");
  }

  // Questions
  if (stage.questions.length > 0) {
    console.log("  \x1b[1mQuestions:\x1b[0m");
    stage.questions.forEach((q, i) => console.log(`    ${i + 1}. ${q}`));
    console.log("");
  }

  // Input
  if (stage.input) {
    console.log(`  \x1b[1mInput:\x1b[0m ${stage.input.label}`);
    if (stage.input.prompt) console.log(`    \x1b[90m${stage.input.prompt}\x1b[0m`);
    console.log("");
  }

  // Confirmation
  if (stage.confirmation) {
    console.log(`  \x1b[1mConfirmation:\x1b[0m ${stage.confirmation}`);
    console.log("");
  }

  // Sidebar panels
  if (stage.sidebarPanels.length > 0) {
    console.log("  \x1b[1mChat sidebar panels:\x1b[0m");
    for (const p of stage.sidebarPanels) {
      console.log(`    \x1b[4m${p.title}\x1b[0m`);
      const lines = p.content.split("\n").slice(0, 3);
      for (const l of lines) console.log(`    ${l}`);
      if (p.content.split("\n").length > 3) console.log(`    \x1b[90m...\x1b[0m`);
    }
    console.log("");
  }
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

// Main loop
async function main() {
  while (true) {
    const cohortId = await select({
      message: "Select cohort to preview:",
      choices: study.cohorts.map((c) => {
        const chatCount = c.stages.filter((s) => s.chatbot).length;
        return {
          name: `${c.label} (${c.stages.length} stages${chatCount > 0 ? `, ${chatCount} with chatbot` : ""})`,
          value: c.cohortId,
        };
      }),
    });

    const cohort = study.cohorts.find((c) => c.cohortId === cohortId)!;
    const result = await previewCohort(cohort);
    if (result === "quit") break;
  }

  console.log("");
  process.exit(0);
}

main();
