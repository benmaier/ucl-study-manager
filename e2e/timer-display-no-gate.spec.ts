/**
 * Regression test for the "show_timer + no gate" combo.
 *
 * Bug: `timerExpired` was conflating "countdown actually hit zero"
 * (which drives the visible MM:SS display) with "submit gate is open"
 * (which drives the form). When `allow_proceeding_only_when_timer_expired`
 * was false, both flipped to true on stage entry, so the visible
 * countdown rendered "00:00 / Time's up!" from the first frame instead
 * of ticking down normally.
 *
 * This test imports the demo study (which has a stage configured with
 * `show_timer: true, allow_proceeding_only_when_timer_expired: false`),
 * seeds a test participant, advances them to the affected stage, and
 * asserts:
 *   - the visible countdown is *not* "00:00" right after entering
 *   - the visible countdown decreases over time
 *   - the submit gate is open from the start (the assertion the bug fix
 *     was trying to preserve, so we don't regress in the other direction)
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

const STUDY_DIR = path.resolve(
  __dirname,
  "..",
  "studies",
  "test-timer-flags-demo",
);
const STUDY_ID = "test_timer_flags_demo";
const COHORT_ID = "default";

const RUN_ID = `timer-disp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
const PARTICIPANT_USER = RUN_ID;
const PARTICIPANT_PASS = "probe-shoal-vent-clay-rise-pine";

// Timer rendered in the sidebar: the big MM:SS in font-mono tabular-nums.
const TIMER = "aside p.font-mono.tabular-nums.text-center";

test.setTimeout(60_000);

async function seed() {
  await importStudyFromDir(STUDY_DIR);
  const study = await prisma.study.findUnique({ where: { studyId: STUDY_ID } });
  if (!study) throw new Error(`Failed to import ${STUDY_ID} study`);
  const cohort = await prisma.cohort.findFirst({
    where: { studyId: study.id, cohortId: COHORT_ID },
  });
  if (!cohort) throw new Error("Missing default cohort on demo study");

  let session = await prisma.studySession.findFirst({ where: { studyId: study.id } });
  if (!session) {
    session = await prisma.studySession.create({
      data: { studyId: study.id, label: "timer-display e2e" },
    });
  }

  await prisma.participant.create({
    data: {
      identifier: PARTICIPANT_USER,
      dbUser: PARTICIPANT_USER,
      dbPassword: await bcrypt.hash(PARTICIPANT_PASS, 10),
      // isTestUser unlocks the "Next (skip timer)" button used to advance
      // past stage 1 without waiting for its full 1-minute timer.
      isTestUser: true,
      sessionId: session.id,
      cohortId: cohort.id,
    },
  });
}

async function cleanup() {
  await prisma.participant.deleteMany({ where: { identifier: PARTICIPANT_USER } });
  await prisma.study.deleteMany({ where: { studyId: STUDY_ID } });
}

async function login(page: Page) {
  await page.goto("/");
  await page.locator("#identifier").fill(PARTICIPANT_USER);
  await page.locator("#password").fill(PARTICIPANT_PASS);
  await page.locator("button[type='submit']").click();
  await page.waitForURL("**/study", { timeout: 15_000 });
}

function parseMMSS(raw: string): number {
  const [m, s] = raw.split(":").map((x) => parseInt(x, 10));
  return m * 60 + s;
}

test.describe("Timer display when show_timer=true and allow_proceeding=false", () => {
  test.beforeAll(seed);
  test.afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  test("countdown ticks normally and submit unlocks immediately", async ({ page }) => {
    await login(page);

    // Stage 1 has the default gated timer; skip it by hitting the
    // progress API directly rather than clicking the test-user button
    // (less race-prone). The demo study's stages are returned by the
    // /api/auth/me endpoint we read at login.
    const meRes = await page.request.get("/api/auth/me");
    const me = await meRes.json();
    const firstStageId = (me.stages ?? me.progress ?? []).find?.(
      (s: { stageId?: number; id?: number; completedAt?: string | null }) =>
        !s.completedAt,
    )?.stageId ?? me.progress?.[0]?.stageId;
    if (!firstStageId) throw new Error("Could not resolve first stage id from /api/auth/me");
    const completeRes = await page.request.post("/api/participant/progress", {
      data: { action: "complete", stageId: firstStageId },
    });
    if (!completeRes.ok()) throw new Error(`Failed to complete stage 1: ${completeRes.status()}`);
    await page.goto("/study");
    await page.waitForURL("**/study", { timeout: 10_000 });

    await expect(page.getByRole("heading", { level: 1, name: /Timer visible, no gating/ }))
      .toBeVisible({ timeout: 10_000 });

    // Assertion 1: countdown is rendered *and* is not stuck at 00:00.
    // Before the fix this came back as "00:00".
    const timer = page.locator(TIMER);
    await expect(timer).toBeVisible({ timeout: 10_000 });
    const initial = (await timer.textContent())?.trim() ?? "";
    expect(initial).toMatch(/^\d{1,2}:\d{2}$/);
    expect(initial).not.toBe("00:00");
    const initialSeconds = parseMMSS(initial);
    expect(initialSeconds).toBeGreaterThan(0);

    // Assertion 2: countdown decreases over time (proves the timer is
    // actually ticking, not just frozen at a non-zero value).
    await page.waitForTimeout(2_500);
    const later = (await timer.textContent())?.trim() ?? "";
    const laterSeconds = parseMMSS(later);
    expect(laterSeconds).toBeLessThan(initialSeconds);

    // Assertion 3: the submit gate is open from the start — that's the
    // *intended* behavior of `allow_proceeding_only_when_timer_expired:
    // false`, so make sure the bug fix didn't accidentally re-close it.
    // Tick the confirmation checkbox; the submit button should enable.
    await page.getByRole("checkbox").check();
    const submit = page.getByRole("button", {
      name: /Submit your answer and proceed|Proceed/i,
    });
    await expect(submit).toBeEnabled();
  });
});
