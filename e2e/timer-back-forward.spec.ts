/**
 * Verifies the stage timer survives back/forward navigation.
 *
 * Scenarios:
 *   1. Fresh login: timer appears and ticks down.
 *   2. Navigate to /login, then forward to /study: timer reappears and ticks.
 *   3. Navigate to about:blank, then forward to /study: same expectation.
 */

import "dotenv/config";
import { test, expect, type Page } from "@playwright/test";

// Uses the standard smoke-lotus-eagle test user that global-setup resets.
// That user's first stage has a 10-second duration — long enough for the
// tick assertions (2.5s wait) as long as we measure before timer hits 0.
const TEST_USER = process.env.TEST_USER!;
const TEST_PASS = process.env.TEST_PASS!;

test.setTimeout(90_000);

async function login(page: Page) {
  await page.goto("/");
  await page.locator("#identifier").fill(TEST_USER);
  await page.locator("#password").fill(TEST_PASS);
  await page.locator("button[type='submit']").click();
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
  test("timer ticks down on fresh login", async ({ page }) => {
    await login(page);
    const t1 = parseMMSS(await readTimer(page));
    await page.waitForTimeout(2_500);
    const t2 = parseMMSS(await readTimer(page));
    console.log(`  fresh: t1=${t1} t2=${t2}`);
    expect(t2).toBeLessThan(t1);
  });

  test("timer still ticks after back-then-forward via Next.js router (goBack/goForward)", async ({ page }) => {
    await login(page);
    const t0 = parseMMSS(await readTimer(page));
    console.log(`  before back: t0=${t0}`);

    // Go back one step (to / which redirects back to /study, so net: stays)
    // Instead, go to an external URL to force actually leaving.
    await page.goto("about:blank");
    await page.waitForTimeout(500);
    await page.goBack(); // back to /study
    await page.waitForURL(/\/study/, { timeout: 10_000 });

    const t1 = parseMMSS(await readTimer(page));
    await page.waitForTimeout(2_500);
    const t2 = parseMMSS(await readTimer(page));
    console.log(`  after forward: t1=${t1} t2=${t2}`);

    expect(t1).toBeLessThanOrEqual(t0);
    expect(t2).toBeLessThan(t1);
  });

  test("timer still ticks after true back-forward through external URL", async ({ page }) => {
    await login(page);
    const t0 = parseMMSS(await readTimer(page));

    // Navigate away hard, then back via browser history.
    await page.evaluate(() => { window.location.href = "about:blank"; });
    await page.waitForURL("about:blank", { timeout: 10_000 });
    await page.waitForTimeout(500);
    await page.goBack(); // back to /study
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
    await login(page);

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
