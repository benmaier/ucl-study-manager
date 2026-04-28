/**
 * Verifies the stage timer survives back/forward navigation.
 *
 * Uses a dedicated `test_timer` study (5-minute first stage) seeded in
 * beforeAll. Each test resets the participant's progress + restarts stage 1
 * via the /api/participant/reset + /progress endpoints so the timer is
 * always fresh — independent of how long the rest of the suite has been
 * running.
 *
 * Scenarios:
 *   1. Fresh login: timer appears and ticks down.
 *   2. Navigate away, then forward to /study: timer reappears and ticks.
 *   3. Two back-forward cycles: timer keeps ticking.
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

const STUDY_DIR = path.resolve(__dirname, "..", "studies", "test-timer");
const STUDY_ID = "test_timer";
const COHORT_ID = "default";

const RUN_ID = `timer-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
const PARTICIPANT_USER = RUN_ID;
const PARTICIPANT_PASS = "probe-shoal-vent-clay-rise-pine";

// Resolved during seed() and reused by resetAndStart() so we don't have to
// pluck stage IDs out of API responses on every test.
let firstStageId: number | null = null;

test.setTimeout(90_000);

async function seed() {
  await importStudyFromDir(STUDY_DIR);
  const study = await prisma.study.findUnique({ where: { studyId: STUDY_ID } });
  if (!study) throw new Error("Failed to import test_timer study");
  const cohort = await prisma.cohort.findFirst({
    where: { studyId: study.id, cohortId: COHORT_ID },
    include: { stages: { orderBy: { order: "asc" } } },
  });
  if (!cohort) throw new Error("Missing default cohort");
  firstStageId = cohort.stages[0]?.id ?? null;
  if (!firstStageId) throw new Error("test_timer cohort has no stages");

  let session = await prisma.studySession.findFirst({ where: { studyId: study.id } });
  if (!session) {
    session = await prisma.studySession.create({
      data: { studyId: study.id, label: "timer-back-forward e2e test" },
    });
  }

  await prisma.participant.create({
    data: {
      identifier: PARTICIPANT_USER,
      dbUser: PARTICIPANT_USER,
      dbPassword: await bcrypt.hash(PARTICIPANT_PASS, 10),
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

// Reset progress + start stage 1 so each test sees a freshly-started timer,
// regardless of how long it took the rest of the suite to get here.
async function resetAndStart(page: Page) {
  if (!firstStageId) throw new Error("seed() did not resolve firstStageId");

  const resetRes = await page.request.post("/api/participant/reset");
  if (!resetRes.ok()) throw new Error(`Reset failed: ${resetRes.status()}`);

  const startRes = await page.request.post("/api/participant/progress", {
    data: { action: "start", stageId: firstStageId },
  });
  if (!startRes.ok()) throw new Error(`Start failed: ${startRes.status()}`);

  // Reload so the page picks up the reset progress.
  await page.goto("/study");
  await page.waitForURL("**/study", { timeout: 15_000 });
}

// Timer selector: the big MM:SS display in the sidebar.
const TIMER = "aside p.font-mono.tabular-nums.text-center";

async function readTimer(page: Page): Promise<string> {
  await page.locator(TIMER).waitFor({ state: "visible", timeout: 10_000 });
  return (await page.locator(TIMER).textContent())?.trim() ?? "";
}

function parseMMSS(v: string): number {
  const [m, s] = v.split(":").map((x) => parseInt(x, 10));
  return m * 60 + s;
}

test.describe("Timer survives back/forward navigation", () => {
  test.beforeAll(seed);
  test.afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  test.beforeEach(async ({ page }) => {
    await login(page);
    await resetAndStart(page);
  });

  test("timer ticks down on fresh login", async ({ page }) => {
    const t1 = parseMMSS(await readTimer(page));
    await page.waitForTimeout(2_500);
    const t2 = parseMMSS(await readTimer(page));
    console.log(`  fresh: t1=${t1} t2=${t2}`);
    expect(t2).toBeLessThan(t1);
  });

  test("timer still ticks after back-then-forward via Next.js router (goBack/goForward)", async ({ page }) => {
    const t0 = parseMMSS(await readTimer(page));
    console.log(`  before back: t0=${t0}`);

    await page.goto("about:blank");
    await page.waitForTimeout(500);
    await page.goBack();
    await page.waitForURL(/\/study/, { timeout: 10_000 });

    const t1 = parseMMSS(await readTimer(page));
    await page.waitForTimeout(2_500);
    const t2 = parseMMSS(await readTimer(page));
    console.log(`  after forward: t1=${t1} t2=${t2}`);

    expect(t1).toBeLessThanOrEqual(t0);
    expect(t2).toBeLessThan(t1);
  });

  test("timer still ticks after true back-forward through external URL", async ({ page }) => {
    const t0 = parseMMSS(await readTimer(page));

    await page.evaluate(() => { window.location.href = "about:blank"; });
    await page.waitForURL("about:blank", { timeout: 10_000 });
    await page.waitForTimeout(500);
    await page.goBack();
    await page.waitForURL(/\/study/, { timeout: 10_000 });

    const t1 = parseMMSS(await readTimer(page));
    await page.waitForTimeout(2_500);
    const t2 = parseMMSS(await readTimer(page));
    console.log(`  after hard-nav back: t0=${t0} t1=${t1} t2=${t2}`);

    expect(t2).toBeLessThan(t1);
  });

  test("timer still ticks after TWO back-forward cycles", async ({ page }) => {
    page.on("console", (msg) => {
      const t = msg.text();
      if (t.includes("[timer-effect]") || t.includes("[pageshow]") || t.includes("[pagehide]") || t.includes("[inline-script]")) {
        console.log("    [browser]", t);
      }
    });

    const getStartedAt = async () => {
      const data = await page.request.get("/api/auth/me").then((r) => r.json());
      const p = (data.progress || []).find((pp: { completedAt: string | null }) => !pp.completedAt);
      return p?.startedAt;
    };

    const cycle = async (label: string) => {
      const t0 = parseMMSS(await readTimer(page));
      const s0 = await getStartedAt();
      await page.evaluate(() => { window.location.href = "about:blank"; });
      await page.waitForURL("about:blank", { timeout: 10_000 });
      await page.waitForTimeout(500);
      await page.goBack();
      await page.waitForURL(/\/study/, { timeout: 10_000 });
      const t1 = parseMMSS(await readTimer(page));
      const s1 = await getStartedAt();
      await page.waitForTimeout(2_500);
      const t2 = parseMMSS(await readTimer(page));
      console.log(`  ${label}: t0=${t0} t1=${t1} t2=${t2} | startedAt ${s0} -> ${s1}`);
      expect(t2).toBeLessThan(t1);
    };

    await cycle("cycle 1");
    await cycle("cycle 2");
    await cycle("cycle 3");
  });
});
