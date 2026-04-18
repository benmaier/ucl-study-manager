/**
 * E2E tests for the back-button fix:
 *   1. Pressing back on /study must not drop the participant onto the login
 *      page mid-study.
 *   2. Navigating to / while logged in bounces back to /study via the
 *      server-side redirect (belt-and-suspenders if the popstate pin fails).
 *
 * Run:
 *   TEST_USER=... TEST_PASS=... npx playwright test back-button
 */

import { test, expect, type Page } from "@playwright/test";

const TEST_USER = process.env.TEST_USER;
const TEST_PASS = process.env.TEST_PASS;

if (!TEST_USER || !TEST_PASS) {
  throw new Error("Set TEST_USER and TEST_PASS env vars for E2E tests");
}

test.setTimeout(60_000);

async function login(page: Page) {
  await page.goto("/");
  await page.locator("#identifier").fill(TEST_USER!);
  await page.locator("#password").fill(TEST_PASS!);
  await page.locator("button[type='submit']").click();
  await page.waitForURL("**/study", { timeout: 15_000 });
}

test.describe("Back-button guard", () => {
  test("pressing back on /study stays on /study", async ({ page }) => {
    await login(page);
    expect(page.url()).toMatch(/\/study$/);

    // Hit browser back. Either the popstate pin keeps us here, or the
    // client-side session check on / bounces us back.
    await page.goBack();

    await page.waitForURL(/\/study$/, { timeout: 5_000 });
    await expect(page.locator("#identifier")).toHaveCount(0);
  });

  test("visiting / while logged in redirects to /study", async ({ page }) => {
    await login(page);

    // Explicitly navigate to / — e.g. via URL bar, bookmark, history.
    await page.goto("/");

    // Server-side redirect should return us to /study.
    await page.waitForURL(/\/study$/, { timeout: 5_000 });
    await expect(page.locator("#identifier")).toHaveCount(0);
  });
});
