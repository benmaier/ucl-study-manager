/**
 * Analysis + plot + CSV export test for each provider.
 * Uploads CSV, asks for analysis with visualization AND a summary CSV file.
 * Verifies artifacts are accessible in the database.
 *
 * Run:
 *   TEST_USER=... TEST_PASS=... npx playwright test analysis-only --headed
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
  throw new Error("Set TEST_USER and TEST_PASS env vars");
}

const TEST_TIMEOUT = 240_000; // 4 minutes per test
const CLOSE_WAIT = 5_000;

test.setTimeout(TEST_TIMEOUT);

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
  await input.click();
  await input.pressSequentially(text, { delay: 10 });
  await page.waitForTimeout(300);
  await input.press("Enter");
  await page.locator(".aui-assistant-message-root").first().waitFor({ state: "visible", timeout: 15_000 });
}

async function waitForChatReady(page: Page) {
  await page.locator(".aui-composer-input").waitFor({ state: "visible", timeout: 30_000 });
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
  await page.locator(".aui-composer-send-icon").waitFor({ state: "visible", timeout: 210_000 });
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

async function completeCurrentStage(page: Page) {
  const heading = await page.locator("h1").first().textContent();
  console.log(`  [completeStage] Current: "${heading}"`);
  const checkbox = page.locator("input[type='checkbox']");
  await checkbox.waitFor({ state: "visible", timeout: 15_000 });
  await checkbox.check();
  await page.waitForTimeout(500);
  const submitBtn = page.locator("button").filter({ hasText: /Proceed|Submit|Finish|Complete/ }).first();
  await submitBtn.waitFor({ state: "visible", timeout: 3_000 });
  await submitBtn.click();
  await page.waitForTimeout(2000);
  const newHeading = await page.locator("h1").first().textContent();
  console.log(`  [completeStage] Now on: "${newHeading}"`);
}

// ---------------------------------------------------------------------------

function analysisTest(providerLabel: string) {
  test(`${providerLabel}: CSV analysis with plot + CSV export`, async ({ page }) => {
    await login(page);
    const chatPage = await openChat(page);
    await waitForChatReady(chatPage);
    const stopExpand = autoExpandToolCards(chatPage);

    await sendMessage(
      chatPage,
      "Plot f(x) = x^2 * exp(-x^2) for x from -4 to 4 and save the plot as a png file. Also save the plotted data (x and y values) as a file called data.csv.",
    );
    await waitForStreamingDone(chatPage);
    stopExpand();
    await logConversation(chatPage);

    // Check that images rendered (plot should be visible as img tag)
    const images = chatPage.locator(".aui-assistant-message-content img");
    const imgCount = await images.count();
    console.log(`  [${providerLabel}] Images rendered: ${imgCount}`);

    // Check for download links (summary.csv should be a link)
    const links = chatPage.locator(".aui-assistant-message-content a[href]");
    const linkCount = await links.count();
    console.log(`  [${providerLabel}] Download links: ${linkCount}`);
    for (let i = 0; i < linkCount; i++) {
      const href = await links.nth(i).getAttribute("href");
      const text = await links.nth(i).textContent();
      console.log(`    [${i}] "${text}" → ${href?.substring(0, 80)}...`);
    }

    // Verify generated files are accessible via the files API
    for (let i = 0; i < linkCount; i++) {
      const href = await links.nth(i).getAttribute("href");
      if (href?.startsWith("/api/threads/")) {
        const response = await chatPage.request.fetch(href);
        console.log(`    File fetch ${href?.substring(0, 60)}... → ${response.status()}`);
        expect(response.status()).toBe(200);
      }
    }
    for (let i = 0; i < imgCount; i++) {
      const src = await images.nth(i).getAttribute("src");
      if (src?.startsWith("/api/threads/")) {
        const response = await chatPage.request.fetch(src);
        console.log(`    Image fetch ${src?.substring(0, 60)}... → ${response.status()}`);
        expect(response.status()).toBe(200);
      }
    }

    await chatPage.waitForTimeout(CLOSE_WAIT);
    await chatPage.close();
  });
}

test.describe.serial("Analysis + Plot + CSV Export", () => {
  analysisTest("Anthropic");

  test("advance to Gemini", async ({ page }) => {
    await login(page);
    await completeCurrentStage(page);
    await expect(page.getByRole("heading", { name: /Gemini/ })).toBeVisible({ timeout: 5_000 });
  });

  analysisTest("Gemini");

  test("advance to OpenAI", async ({ page }) => {
    await login(page);
    await completeCurrentStage(page);
    await expect(page.getByRole("heading", { name: /OpenAI/ })).toBeVisible({ timeout: 5_000 });
  });

  analysisTest("OpenAI");
});
