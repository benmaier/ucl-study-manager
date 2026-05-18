/**
 * Regression for the "No user message" 400 on file-only uploads.
 *
 * The widget's chat handler reads `extractText(msg)` from `msg.parts`
 * and 400s when the result is empty. If a participant attaches a file
 * without typing anything in the composer, `parts` only carries the
 * file and there's no text — the request is rejected and the widget
 * shows a red "Something went wrong: No user message" banner.
 *
 * Our `/api/chat` route preprocesses the body to inject a small
 * placeholder text part in that case. This test drives a real file-
 * only upload through the widget and asserts:
 *   - no error banner appears, and
 *   - an assistant response actually streams back.
 */

import "dotenv/config";
import path from "path";
import { fileURLToPath } from "url";
import { test, expect, type Page } from "@playwright/test";
import { resetSharedUser } from "./lib/reset-shared-user";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FIXTURES = path.join(__dirname, "fixtures");

const TEST_USER = process.env.TEST_USER;
const TEST_PASS = process.env.TEST_PASS;

if (!TEST_USER || !TEST_PASS) {
  throw new Error("Set TEST_USER and TEST_PASS env vars");
}

test.setTimeout(120_000);

test.beforeAll(resetSharedUser);

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
  await chatPage.locator(".aui-composer-input").waitFor({ state: "visible", timeout: 30_000 });
  return chatPage;
}

test("uploading a file without typing any text produces a normal response, not an error banner", async ({ page }) => {
  await login(page);
  const chat = await openChat(page);
  await chat.bringToFront();
  // Small settle before interacting — matches what other suite tests do.
  await chat.waitForTimeout(500);

  // Attach a file via the composer's add-attachment button.
  const addBtn = chat.locator(".aui-composer-add-attachment");
  await addBtn.waitFor({ state: "visible", timeout: 10_000 });
  const [fileChooser] = await Promise.all([
    chat.waitForEvent("filechooser", { timeout: 10_000 }),
    addBtn.click(),
  ]);
  await fileChooser.setFiles([path.join(FIXTURES, "test-data.csv")]);
  await chat.waitForTimeout(1_000);

  // Send WITHOUT typing anything. Wait for the send button to enable
  // (it's disabled during the upload step), then click it.
  const messages = chat.locator(".aui-assistant-message-root");
  const sendBtn = chat.locator(".aui-composer-send");
  await expect.poll(() => sendBtn.isEnabled(), { timeout: 30_000 }).toBe(true);
  await sendBtn.click();

  // Wait for an assistant message to render. Without the fix the widget
  // shows a "Something went wrong: No user message" banner and no
  // assistant message ever appears.
  await expect.poll(() => messages.count(), { timeout: 90_000 }).toBeGreaterThan(0);

  // And explicitly assert the banner did NOT appear.
  const errorBanner = chat.getByText(/No user message|Something went wrong/i);
  await expect(errorBanner).toHaveCount(0);
});
