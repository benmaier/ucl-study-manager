/**
 * E2E tests for the UCL Study Manager production deployment.
 *
 * Tests participant login, study stage navigation, and chatbot functionality
 * against the live Vercel deployment using the "chatbot_test" study.
 *
 * The chatbot_test study has 3 stages: Anthropic → Gemini → OpenAI.
 * Each provider gets the same set of chat tests.
 *
 * Run:
 *   TEST_USER=... TEST_PASS=... npx playwright test --headed
 */

import { test, expect, type Page } from "@playwright/test";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TEST_USER = process.env.TEST_USER;
const TEST_PASS = process.env.TEST_PASS;
const FIXTURES = path.join(__dirname, "fixtures");

if (!TEST_USER || !TEST_PASS) {
  throw new Error("Set TEST_USER and TEST_PASS env vars for E2E tests");
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function login(page: Page) {
  await page.goto("/");
  await page.locator("#identifier").fill(TEST_USER!);
  await page.locator("#password").fill(TEST_PASS!);
  await page.locator("button[type='submit']").click();
  await page.waitForURL("**/study", { timeout: 15_000 });
  const heading = await page.locator("h1").first().textContent().catch(() => "?");
  const status = await page.request.fetch("/api/chat/status").then(r => r.json()).catch(() => ({}));
  console.log(`  [login] Page: "${heading}", chatStageId: ${status.stageId}, available: ${status.available}`);
}

async function openChat(page: Page): Promise<Page> {
  // Log current stage before opening chat
  const status = await page.request.fetch("/api/chat/status").catch(() => null);
  if (status) {
    const data = await status.json().catch(() => ({}));
    const heading = await page.locator("h1").first().textContent().catch(() => "?");
    console.log(`  [openChat] Study page heading: "${heading}", chat stageId: ${data.stageId}, available: ${data.available}`);
  }

  const [chatPage] = await Promise.all([
    page.context().waitForEvent("page"),
    page.locator("text=Open AI Assistant").click(),
  ]);
  await chatPage.waitForLoadState("domcontentloaded");
  return chatPage;
}

async function waitForChatReady(page: Page) {
  await page.locator(".aui-composer-input").waitFor({ state: "visible", timeout: 30_000 });
}

async function sendMessage(page: Page, text: string) {
  await page.bringToFront();
  const input = page.locator(".aui-composer-input");
  await input.click();
  await input.pressSequentially(text, { delay: 10 });
  await page.waitForTimeout(300);
  await input.press("Enter");
  await page.locator(".aui-assistant-message-root").first().waitFor({ state: "visible", timeout: 15_000 });
}

async function sendMessageWithFiles(page: Page, text: string, filePaths: string[]) {
  await page.bringToFront();
  await page.waitForTimeout(500);
  const addBtn = page.locator(".aui-composer-add-attachment");
  await addBtn.waitFor({ state: "visible", timeout: 3_000 });
  const [fileChooser] = await Promise.all([
    page.waitForEvent("filechooser", { timeout: 5_000 }),
    addBtn.click(),
  ]);
  await fileChooser.setFiles(filePaths);
  await page.waitForTimeout(1000);
  const input = page.locator(".aui-composer-input");
  await input.click();
  await input.pressSequentially(text, { delay: 10 });
  await page.waitForTimeout(300);
  await input.press("Enter");
  await page.locator(".aui-assistant-message-root").first().waitFor({ state: "visible", timeout: 15_000 });
}

async function waitForStreamingDone(page: Page) {
  await page.locator(".aui-composer-send").waitFor({ state: "visible", timeout: 90_000 });
}

async function logConversation(page: Page) {
  const messages = page.locator(".aui-assistant-message-content");
  const count = await messages.count();
  console.log(`  [conversation] ${count} assistant message(s):`);
  for (let i = 0; i < count; i++) {
    const text = await messages.nth(i).textContent();
    console.log(`    [${i}] ${text?.substring(0, 200)}${(text?.length || 0) > 200 ? "..." : ""}`);
  }
}

function autoExpandToolCards(page: Page): () => void {
  const toolCards = page.locator(".aui-tool-fallback-root");
  let expandedCount = 0;
  const interval = setInterval(async () => {
    try {
      const count = await toolCards.count();
      for (let i = expandedCount; i < count; i++) {
        const trigger = toolCards.nth(i).locator(".aui-tool-fallback-trigger");
        if (await trigger.isVisible()) await trigger.click();
      }
      expandedCount = count;
    } catch {}
  }, 300);
  return () => clearInterval(interval);
}

async function verifyToolCards(page: Page) {
  const toolCards = page.locator(".aui-tool-fallback-root");
  const count = await toolCards.count();
  for (let i = 0; i < count; i++) {
    const card = toolCards.nth(i);
    const content = card.locator(".aui-tool-fallback-args");
    if (await content.count() === 0 || !(await content.isVisible())) {
      await card.locator(".aui-tool-fallback-trigger").click();
      await page.waitForTimeout(300);
    }
    const args = card.locator(".aui-tool-fallback-args");
    if (await args.count() > 0) {
      await expect(args).toBeVisible();
      expect((await args.textContent())!.length).toBeGreaterThan(3);
    }
    const result = card.locator(".aui-tool-fallback-result-content");
    if (await result.count() > 0) {
      await expect(result).toBeVisible();
      expect(await result.textContent()).toBeTruthy();
    }
  }
}

async function completeCurrentStage(page: Page) {
  const heading = await page.locator("h1").first().textContent();
  console.log(`  [completeStage] Current: "${heading}"`);

  // Wait for timer to expire (stages have 10s timers)
  const submitBtn = page.locator("button").filter({ hasText: /Proceed|Submit|Finish|Complete/ }).first();
  await submitBtn.waitFor({ state: "visible", timeout: 15_000 });

  // Check confirmation checkbox
  const checkbox = page.locator("input[type='checkbox']");
  await checkbox.waitFor({ state: "visible", timeout: 3_000 });
  await checkbox.check();
  await page.waitForTimeout(500);

  // Click proceed
  await submitBtn.click();
  await page.waitForTimeout(2000);

  const newHeading = await page.locator("h1").first().textContent();
  console.log(`  [completeStage] Now on: "${newHeading}"`);
}

// ---------------------------------------------------------------------------
// Shared chat test suite — runs the same tests for each provider
// ---------------------------------------------------------------------------

function chatTestsFor(providerLabel: string) {
  test("text message", async ({ page }) => {
    await login(page);
    const chatPage = await openChat(page);
    await waitForChatReady(chatPage);

    await sendMessage(chatPage, "Say exactly: Hello from the test suite");
    await waitForStreamingDone(chatPage);
    await logConversation(chatPage);

    const text = await chatPage.locator(".aui-assistant-message-content").first().textContent();
    expect(text!.length).toBeGreaterThan(0);
    await chatPage.waitForTimeout(5000);
    await chatPage.close();
  });

  test("tool call with code execution", async ({ page }) => {
    await login(page);
    const chatPage = await openChat(page);
    await waitForChatReady(chatPage);
    const stopExpand = autoExpandToolCards(chatPage);

    await sendMessage(chatPage, "You MUST use your code execution tool to run this Python code. Do NOT answer without running the code: print(2 + 2)");
    const toolCard = chatPage.locator(".aui-tool-fallback-root").first();
    await toolCard.waitFor({ state: "visible", timeout: 60_000 });
    await waitForStreamingDone(chatPage);
    stopExpand();
    await logConversation(chatPage);

    await expect(toolCard.locator(".aui-tool-fallback-trigger")).toContainText("Used tool");
    await verifyToolCards(chatPage);
    await chatPage.waitForTimeout(5000);
    await chatPage.close();
  });

  test("image + CSV upload", async ({ page }) => {
    await login(page);
    const chatPage = await openChat(page);
    await waitForChatReady(chatPage);
    const stopExpand = autoExpandToolCards(chatPage);

    await sendMessageWithFiles(
      chatPage,
      "I've attached an image and a CSV. The image has a 5-letter code in black text on white background. What is the code? Also tell me how many rows the CSV has.",
      [path.join(FIXTURES, "test-image.png"), path.join(FIXTURES, "test-data.csv")],
    );
    await waitForStreamingDone(chatPage);
    stopExpand();
    await logConversation(chatPage);

    const content = await chatPage.locator(".aui-assistant-message-content").first().textContent();
    expect(content!.toUpperCase()).toContain("BRAVO");
    expect(content).toMatch(/100[01]|1,00[01]|thousand/);
    await chatPage.waitForTimeout(5000);
    await chatPage.close();
  });

  test("image memory across turns", async ({ page }) => {
    await login(page);
    const chatPage = await openChat(page);
    await waitForChatReady(chatPage);

    await sendMessageWithFiles(
      chatPage,
      "This image has a 5-letter code in black text. What is it? Remember it.",
      [path.join(FIXTURES, "test-image.png")],
    );
    await waitForStreamingDone(chatPage);
    await logConversation(chatPage);

    await sendMessage(chatPage, "What was the 5-letter code in the image I sent earlier?");
    await waitForStreamingDone(chatPage);
    await logConversation(chatPage);

    const messages = chatPage.locator(".aui-assistant-message-content");
    const count = await messages.count();
    expect(count).toBeGreaterThanOrEqual(2);
    const text = await messages.nth(count - 1).textContent();
    expect(text!.toUpperCase()).toContain("BRAVO");
    await chatPage.waitForTimeout(5000);
    await chatPage.close();
  });

  test("conversation survives page reload", async ({ page }) => {
    await login(page);
    const chatPage = await openChat(page);
    await waitForChatReady(chatPage);

    await sendMessage(chatPage, "Remember this exact phrase: pineapple-telescope-42");
    await waitForStreamingDone(chatPage);
    await logConversation(chatPage);

    await chatPage.reload();
    await waitForChatReady(chatPage);
    await chatPage.waitForTimeout(3000);

    // Click first thread
    const thread = chatPage.locator("[data-slot='thread-list-item'] button, .group.flex.items-center.rounded-md button").first();
    if (await thread.isVisible({ timeout: 3000 }).catch(() => false)) {
      await thread.click();
      await chatPage.waitForTimeout(2000);
    }

    await sendMessage(chatPage, "What was the exact phrase I asked you to remember? Repeat it.");
    await waitForStreamingDone(chatPage);
    await logConversation(chatPage);

    const text = await chatPage.locator(".aui-assistant-message-content").last().textContent();
    expect(text!.toLowerCase()).toMatch(/pineapple|telescope|42/);
    await chatPage.waitForTimeout(5000);
    await chatPage.close();
  });
}

// ---------------------------------------------------------------------------
// Test suites
// ---------------------------------------------------------------------------

test.describe.serial("Anthropic (stage 1)", () => {
  chatTestsFor("Anthropic");
});

test.describe.serial("Gemini (stage 2)", () => {
  test("advance to Gemini", async ({ page }) => {
    await login(page);
    await completeCurrentStage(page);
    await expect(page.getByRole("heading", { name: /Gemini/ })).toBeVisible({ timeout: 5_000 });
  });
  chatTestsFor("Gemini");
});

test.describe.serial("OpenAI (stage 3)", () => {
  test("advance to OpenAI", async ({ page }) => {
    await login(page);
    await completeCurrentStage(page);
    await expect(page.getByRole("heading", { name: /OpenAI/ })).toBeVisible({ timeout: 5_000 });
  });
  chatTestsFor("OpenAI");
});

// ---------------------------------------------------------------------------
// Privacy page
// ---------------------------------------------------------------------------

test.describe("Privacy & Contact", () => {
  test("privacy page is accessible from login", async ({ page }) => {
    await page.goto("/");
    await page.locator("a[href='/privacy-and-contact']").first().click();
    await expect(page).toHaveURL(/privacy-and-contact/);
    await expect(page.getByRole("heading", { name: "Data controller" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Cookies" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Your rights" })).toBeVisible();
  });
});
