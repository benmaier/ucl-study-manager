/**
 * E2E test for the `code_to_progress` stage field.
 *
 * Imports the small studies/test-code-gate fixture, creates a dedicated
 * participant, logs in, and exercises the gated stage's behavior:
 *   - the Completion code input renders
 *   - wrong code keeps the submit button disabled
 *   - right code enables submit (with confirmation checkbox)
 *
 * Cleans up the participant + study afterwards so we don't leave it in the
 * DB.
 *
 * Run:
 *   npx playwright test code-to-progress
 */

import "dotenv/config";
import { test, expect, type Page } from "@playwright/test";
import path from "path";
import bcrypt from "bcryptjs";
import { fileURLToPath } from "url";
import { prisma } from "../src/lib/prisma";
import { importStudyFromDir } from "../src/lib/study-importer";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const STUDY_DIR = path.resolve(__dirname, "..", "studies", "test-code-gate");
const STUDY_ID = "test_code_gate";
const COHORT_ID = "default";
const CORRECT_CODE = "SECRET-123";

const RUN_ID = `code-gate-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
const PARTICIPANT_USER = RUN_ID;
const PARTICIPANT_PASS = "probe-shoal-vent-clay-rise-pine";

test.setTimeout(60_000);

async function seed() {
  // Import the fixture study (idempotent — upserts study + cohort + stages).
  await importStudyFromDir(STUDY_DIR);

  const study = await prisma.study.findUnique({ where: { studyId: STUDY_ID } });
  if (!study) throw new Error("Failed to import test-code-gate study");
  const cohort = await prisma.cohort.findFirst({
    where: { studyId: study.id, cohortId: COHORT_ID },
  });
  if (!cohort) throw new Error("Missing default cohort");

  // Find-or-create a session for this study.
  let session = await prisma.studySession.findFirst({ where: { studyId: study.id } });
  if (!session) {
    session = await prisma.studySession.create({
      data: { studyId: study.id, label: "code-gate e2e test" },
    });
  }

  await prisma.participant.create({
    data: {
      identifier: PARTICIPANT_USER,
      dbUser: PARTICIPANT_USER,
      dbPassword: await bcrypt.hash(PARTICIPANT_PASS, 10),
      isTestUser: false,
      sessionId: session.id,
      cohortId: cohort.id,
    },
  });
}

async function cleanup() {
  await prisma.participant.deleteMany({ where: { identifier: PARTICIPANT_USER } });
  // Delete the study (cascades to cohort, stages, stage files, any progress).
  await prisma.study.deleteMany({ where: { studyId: STUDY_ID } });
}

async function login(page: Page) {
  await page.goto("/");
  await page.locator("#identifier").fill(PARTICIPANT_USER);
  await page.locator("#password").fill(PARTICIPANT_PASS);
  await page.locator("button[type='submit']").click();
  await page.waitForURL("**/study", { timeout: 15_000 });
}

test.describe("code_to_progress gate", () => {
  test.beforeAll(seed);
  test.afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  test("submit stays disabled until the right code is entered", async ({ page }) => {
    await login(page);

    // On the gated first stage. Wait for timer to expire (1s duration).
    await page.waitForTimeout(1500);

    // Completion code input must be visible + enabled.
    const codeInput = page.getByLabel("Completion code", { exact: true });
    await expect(codeInput).toBeVisible();
    await expect(codeInput).toBeEnabled();

    // Confirmation checkbox is visible too — the stage has both.
    const confirmCheckbox = page.getByRole("checkbox");
    await confirmCheckbox.check();

    // Submit button — the stage has no input field, so button reads "Proceed".
    const submit = page.getByRole("button", { name: "Proceed", exact: true });
    await expect(submit).toBeDisabled();

    // Type the wrong code — still disabled, error visible.
    await codeInput.fill("WRONG-CODE");
    await expect(submit).toBeDisabled();
    await expect(page.getByText("Code doesn't match")).toBeVisible();

    // Now the right code — submit flips to enabled.
    await codeInput.fill(CORRECT_CODE);
    await expect(submit).toBeEnabled();
    await expect(page.getByText("Code doesn't match")).toHaveCount(0);

    // Clicking submit advances to the ungated stage.
    // After the click, a new `Proceed` button appears for the ungated stage;
    // re-resolve it so the old element reference doesn't trip us up.
    await submit.click();
    await page.waitForTimeout(500);
    await expect(page.getByRole("heading", { name: "Ungated Stage" })).toBeVisible({ timeout: 10_000 });

    // Ungated stage should NOT show a completion code field.
    await expect(page.getByLabel("Completion code")).toHaveCount(0);
  });
});
