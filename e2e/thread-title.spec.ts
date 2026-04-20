/**
 * E2E test for LLM-generated thread titles.
 *
 * Sends a first message in a fresh chat thread and verifies the thread
 * gets a real title (not the fallback "Chat NN"). Title generation is
 * fire-and-forget from the widget's perspective, awaited before the SSE
 * stream closes — so by the time the assistant response is streamed,
 * the title should already be persisted.
 *
 * Run:
 *   TEST_USER=... TEST_PASS=... npx playwright test thread-title
 */

import { test, expect, type Page } from "@playwright/test";

const TEST_USER = process.env.TEST_USER;
const TEST_PASS = process.env.TEST_PASS;

if (!TEST_USER || !TEST_PASS) {
  throw new Error("Set TEST_USER and TEST_PASS env vars for E2E tests");
}

test.setTimeout(120_000);

async function login(page: Page) {
  await page.goto("/");
  await page.locator("#identifier").fill(TEST_USER!);
  await page.locator("#password").fill(TEST_PASS!);
  await page.locator("button[type='submit']").click();
  await page.waitForURL("**/study", { timeout: 15_000 });
}

async function openChat(page: Page): Promise<Page> {
  const [chatPage] = await Promise.all([
    page.context().waitForEvent("page"),
    page.locator("text=Open AI Assistant").click(),
  ]);
  await chatPage.waitForLoadState("domcontentloaded");
  return chatPage;
}

async function sendMessage(page: Page, text: string) {
  await page.bringToFront();
  const input = page.locator(".aui-composer-input");
  await input.waitFor({ state: "visible", timeout: 30_000 });
  await input.click();
  await input.pressSequentially(text, { delay: 10 });
  await page.waitForTimeout(300);
  await input.press("Enter");
  await page.locator(".aui-assistant-message-root").first().waitFor({ state: "visible", timeout: 30_000 });
}

async function waitForStreamingDone(page: Page) {
  // Send-icon reappears when the stream closes. Title-gen is awaited before
  // close, so once this resolves the title should be in the DB.
  await page.locator(".aui-composer-send-icon").waitFor({ state: "visible", timeout: 90_000 });
}

test.describe("Thread title generation", () => {
  test("first message on a fresh thread produces a non-default title", async ({ page }) => {
    await login(page);
    const chat = await openChat(page);

    const prompt = "What is the capital of France?";
    await sendMessage(chat, prompt);
    await waitForStreamingDone(chat);

    // Fetch threads from the backend (widget's own listing endpoint).
    const res = await chat.request.get("/api/threads");
    expect(res.ok()).toBe(true);
    const body = await res.json();

    // The widget response shape is { threads: [{ id, title, ... }] } — tolerate
    // either `threads` or a top-level array just in case.
    const threads: Array<{ title?: string; id?: string }> =
      Array.isArray(body) ? body : body?.threads ?? [];

    console.log(`  [thread-title] ${threads.length} thread(s):`);
    for (const t of threads) console.log(`    ${JSON.stringify(t)}`);

    expect(threads.length).toBeGreaterThan(0);

    // Every thread that has at least one turn should have a non-fallback title.
    // Fallback pattern: "Chat 01", "Chat 02", ...
    const fallback = /^Chat\s+\d+$/;
    const meaningful = threads.filter((t) => t.title && !fallback.test(t.title));
    expect(meaningful.length).toBeGreaterThan(0);

    // Title shouldn't be an empty string, just whitespace, or ridiculously long.
    for (const t of meaningful) {
      expect(t.title!.trim().length).toBeGreaterThan(0);
      expect(t.title!.length).toBeLessThan(120);
    }
  });
});
