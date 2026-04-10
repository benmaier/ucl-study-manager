/**
 * E2E tests for the UCL Study Manager production deployment.
 *
 * Tests participant login, study stage navigation, and chatbot functionality
 * against the live Vercel deployment using the "chatbot_test" study.
 *
 * Requires a test user for the chatbot_test study. Set env vars:
 *   TEST_USER=smile-shell-opera
 *   TEST_PASS=whole-cabin-linen-bloom-slate-flash
 *   BASE_URL=https://ucl-study-manager.vercel.app  (default)
 *
 * Run:
 *   npx playwright test
 *   npx playwright test --headed  (watch in browser)
 */

import { test, expect, type Page, type BrowserContext } from "@playwright/test";
import path from "path";

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
}

/** Log in and reset the test user's progress, chat logs, and conversations. */
async function loginAndReset(page: Page) {
  await login(page);
  const response = await page.request.post("/api/participant/reset");
  expect(response.ok()).toBe(true);
  // Reload to get fresh stage state
  await page.goto("/study");
  await page.waitForURL("**/study", { timeout: 15_000 });
}

async function skipTimer(page: Page) {
  const skipBtn = page.locator("text=Next (skip timer)");
  if (await skipBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    await skipBtn.click();
  }
}

async function openChat(page: Page): Promise<Page> {
  const [chatPage] = await Promise.all([
    page.context().waitForEvent("page"),
    page.locator("text=Open AI Assistant").click(),
  ]);
  await chatPage.waitForLoadState("domcontentloaded");
  return chatPage;
}

async function waitForChatReady(page: Page) {
  await page.locator(".aui-composer-input").waitFor({ state: "visible", timeout: 15_000 });
}

async function sendMessage(page: Page, text: string) {
  const input = page.locator(".aui-composer-input");
  await input.fill(text);
  await page.locator(".aui-composer-send").click();
  await page.locator(".aui-assistant-message-root").first().waitFor({ state: "visible", timeout: 30_000 });
}

async function sendMessageWithFiles(page: Page, text: string, filePaths: string[]) {
  const fileInput = page.locator(".aui-composer-add-attachment input[type='file']");
  if (await fileInput.count() === 0) {
    const [fileChooser] = await Promise.all([
      page.waitForEvent("filechooser"),
      page.locator(".aui-composer-add-attachment").click(),
    ]);
    await fileChooser.setFiles(filePaths);
  } else {
    await fileInput.setInputFiles(filePaths);
  }
  await page.waitForTimeout(500);
  const input = page.locator(".aui-composer-input");
  await input.fill(text);
  await page.locator(".aui-composer-send").click();
  await page.locator(".aui-assistant-message-root").first().waitFor({ state: "visible", timeout: 30_000 });
}

async function waitForStreamingDone(page: Page) {
  await page.locator(".aui-composer-send").waitFor({ state: "visible", timeout: 90_000 });
}

function autoExpandToolCards(page: Page): () => void {
  const toolCards = page.locator(".aui-tool-fallback-root");
  let expandedCount = 0;
  const interval = setInterval(async () => {
    try {
      const count = await toolCards.count();
      for (let i = expandedCount; i < count; i++) {
        const trigger = toolCards.nth(i).locator(".aui-tool-fallback-trigger");
        if (await trigger.isVisible()) {
          await trigger.click();
        }
      }
      expandedCount = count;
    } catch { /* page may be navigating */ }
  }, 300);
  return () => clearInterval(interval);
}

async function verifyToolCards(page: Page) {
  const toolCards = page.locator(".aui-tool-fallback-root");
  const count = await toolCards.count();
  for (let i = 0; i < count; i++) {
    const card = toolCards.nth(i);
    const trigger = card.locator(".aui-tool-fallback-trigger");
    const content = card.locator(".aui-tool-fallback-args");
    if (await content.count() === 0 || !(await content.isVisible())) {
      await trigger.click();
      await page.waitForTimeout(300);
    }
    const args = card.locator(".aui-tool-fallback-args");
    if (await args.count() > 0) {
      await expect(args).toBeVisible();
      const argsText = await args.textContent();
      expect(argsText!.length).toBeGreaterThan(3);
    }
    const result = card.locator(".aui-tool-fallback-result-content");
    if (await result.count() > 0) {
      await expect(result).toBeVisible();
      expect(await result.textContent()).toBeTruthy();
    }
  }
}

// ---------------------------------------------------------------------------
// Login & navigation tests
// ---------------------------------------------------------------------------

test.describe("Study flow", () => {
  test("participant can log in and see study", async ({ page }) => {
    await loginAndReset(page);
    await expect(page.locator("text=Schedule")).toBeVisible();
    // Chatbot test study has 3 stages
    await expect(page.locator("text=Anthropic")).toBeVisible();
    await expect(page.locator("text=Gemini")).toBeVisible();
    await expect(page.locator("text=OpenAI")).toBeVisible();
  });

  test("stage content renders with chatbot button", async ({ page }) => {
    await loginAndReset(page);
    await expect(page.locator("text=Open AI Assistant")).toBeVisible({ timeout: 10_000 });
  });

  test("test user can skip timer", async ({ page }) => {
    await loginAndReset(page);
    const skipBtn = page.locator("text=Next (skip timer)");
    await expect(skipBtn).toBeVisible({ timeout: 5_000 });
  });
});

// ---------------------------------------------------------------------------
// Chat tests (Anthropic stage — first stage in chatbot-test study)
// ---------------------------------------------------------------------------

test.describe("Chat — Anthropic stage", () => {
  let studyPage: Page;
  let chatPage: Page;

  test.beforeEach(async ({ page }) => {
    studyPage = page;
    await loginAndReset(studyPage);
    chatPage = await openChat(studyPage);
    await waitForChatReady(chatPage);
  });

  test.afterEach(async () => {
    await chatPage.close();
  });

  test("chat page loads with composer", async () => {
    await expect(chatPage.locator(".aui-composer-input")).toBeVisible();
    await expect(chatPage.locator(".aui-composer-input")).toBeEnabled();
  });

  test("send text message and receive response", async () => {
    await sendMessage(chatPage, "Say exactly: Hello from the test suite");
    await waitForStreamingDone(chatPage);

    const content = chatPage.locator(".aui-assistant-message-content").first();
    const text = await content.textContent();
    expect(text!.length).toBeGreaterThan(0);
  });

  test("tool call renders with code and result", async () => {
    const stopExpand = autoExpandToolCards(chatPage);

    await sendMessage(chatPage, "Execute this Python code: print(2 + 2). Show me the result.");
    const toolCard = chatPage.locator(".aui-tool-fallback-root").first();
    await toolCard.waitFor({ state: "visible", timeout: 60_000 });
    await waitForStreamingDone(chatPage);
    stopExpand();

    const trigger = toolCard.locator(".aui-tool-fallback-trigger");
    await expect(trigger).toContainText("Used tool");

    await verifyToolCards(chatPage);
  });

  test("LLM sees image and CSV when sent together", async () => {
    const stopExpand = autoExpandToolCards(chatPage);

    await sendMessageWithFiles(
      chatPage,
      "I've attached an image and a CSV. Briefly describe the image, and tell me how many rows the CSV has.",
      [
        path.join(FIXTURES, "test-image.png"),
        path.join(FIXTURES, "test-data.csv"),
      ],
    );
    await waitForStreamingDone(chatPage);
    stopExpand();

    const content = await chatPage.locator(".aui-assistant-message-content").first().textContent();
    expect(content!.toLowerCase()).toMatch(/image|picture|visual|white|pixel|blank|photo/);
    expect(content).toMatch(/1000|1,000|thousand/);
  });

  test("LLM remembers image from previous turn", async () => {
    await sendMessageWithFiles(
      chatPage,
      "Remember this image for later.",
      [path.join(FIXTURES, "test-image.png")],
    );
    await waitForStreamingDone(chatPage);

    await sendMessage(chatPage, "What did the image I sent earlier look like? Describe it briefly.");
    await waitForStreamingDone(chatPage);

    const messages = chatPage.locator(".aui-assistant-message-content");
    const lastMessage = messages.last();
    const text = await lastMessage.textContent();
    expect(text!.toLowerCase()).toMatch(/image|picture|earlier|previous|white|pixel|blank/);
  });
});

// ---------------------------------------------------------------------------
// Privacy page
// ---------------------------------------------------------------------------

test.describe("Privacy & Contact", () => {
  test("privacy page is accessible from login", async ({ page }) => {
    await page.goto("/");
    await page.locator("text=Privacy & Contact").click();
    await expect(page).toHaveURL(/privacy-and-contact/);
    await expect(page.locator("text=Data controller")).toBeVisible();
    await expect(page.locator("text=Cookies")).toBeVisible();
    await expect(page.locator("text=Your rights")).toBeVisible();
  });
});
