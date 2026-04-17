/**
 * E2E test for the floating timer (Document Picture-in-Picture).
 *
 * Document PiP is a Chromium-only API. Other browsers should not see the
 * button. This test is therefore guarded by `browserName === "chromium"`.
 *
 * Run:
 *   TEST_USER=... TEST_PASS=... npx playwright test pip-timer --headed
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

test.describe("Floating timer (Document PiP)", () => {
  test("opens, displays countdown, closes via button", async ({ page, browserName }) => {
    test.skip(browserName !== "chromium", "Document PiP is Chromium-only");

    await login(page);

    // Feature detection should succeed in headed + headless Chromium alike.
    const supported = await page.evaluate(() => "documentPictureInPicture" in window);
    test.skip(!supported, "documentPictureInPicture not available in this Chromium build");

    const openButton = page.getByRole("button", { name: "Open floating timer" });
    await expect(openButton).toBeVisible();

    // Clicking the button should open a Document PiP window. Playwright
    // surfaces that as a new page in the context.
    const [pipPage] = await Promise.all([
      page.context().waitForEvent("page", { timeout: 10_000 }),
      openButton.click(),
    ]);
    await pipPage.waitForLoadState("domcontentloaded");

    // Countdown in the PiP window — matches the MM:SS format.
    const countdown = pipPage.locator("[data-testid='pip-countdown']").first();
    await expect(countdown).toBeVisible({ timeout: 10_000 });
    await expect(countdown).toHaveText(/^\d+:\d{2}$/);

    // Stage title should appear above the countdown.
    const stageTitle = pipPage.locator("p").first();
    await expect(stageTitle).not.toBeEmpty();

    // If the stage isn't already expired, verify the timer ticks.
    const firstValue = (await countdown.textContent())?.trim();
    if (firstValue && firstValue !== "00:00") {
      await expect(async () => {
        const v = (await countdown.textContent())?.trim();
        expect(v).not.toBe(firstValue);
      }).toPass({ timeout: 3_000 });
    }

    // Main-page button should have flipped to the close state.
    const closeButton = page.getByRole("button", { name: "Close floating timer" });
    await expect(closeButton).toBeVisible();

    // Leave the PiP window open for ~10s so a human running --headed can eyeball it.
    await page.waitForTimeout(10_000);

    // Clicking close returns the button to its open state.
    await closeButton.click();
    await expect(openButton).toBeVisible({ timeout: 5_000 });
  });
});
