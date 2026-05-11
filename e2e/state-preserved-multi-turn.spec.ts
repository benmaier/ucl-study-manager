/**
 * Regression: after a second message in the same chat thread, the
 * persisted `chat_conversations.state` must still contain a valid
 * SerializedConversation (formatVersion + turns[]). Previously
 * `onUserMessageReceived` replaced the row's state entirely with just
 * pending markers, blowing away turn 1's payload — symptom was an
 * "Invalid conversation data: missing or invalid formatVersion" banner
 * on turn 2, especially on file-upload turns.
 *
 * Sends two text messages in one thread, then asserts the persisted
 * state has both turns and the formatVersion is set.
 */
import "dotenv/config";
import path from "path";
import { fileURLToPath } from "url";
import { test, expect, type Page } from "@playwright/test";
import { prisma } from "../src/lib/prisma";
import { resetSharedUser } from "./lib/reset-shared-user";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FIXTURES = path.join(__dirname, "fixtures");

const TEST_USER = process.env.TEST_USER;
const TEST_PASS = process.env.TEST_PASS;

if (!TEST_USER || !TEST_PASS) {
  throw new Error("Set TEST_USER and TEST_PASS env vars");
}

test.setTimeout(180_000);

test.beforeAll(resetSharedUser);
test.afterAll(async () => {
  await prisma.$disconnect();
});

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

async function sendAndWait(chat: Page, text: string, filePath?: string) {
  await chat.bringToFront();
  const messages = chat.locator(".aui-assistant-message-root");
  const before = await messages.count();
  if (filePath) {
    const addBtn = chat.locator(".aui-composer-add-attachment");
    await addBtn.waitFor({ state: "visible", timeout: 5_000 });
    const [fileChooser] = await Promise.all([
      chat.waitForEvent("filechooser", { timeout: 5_000 }),
      addBtn.click(),
    ]);
    await fileChooser.setFiles([filePath]);
    await chat.waitForTimeout(1_000);
  }
  const input = chat.locator(".aui-composer-input");
  await input.click();
  await input.pressSequentially(text, { delay: 10 });
  await chat.waitForTimeout(300);
  const sendBtn = chat.locator(".aui-composer-send");
  // File uploads can take a while on prod (cold start + upload),
  // during which the send button stays disabled. Give it room.
  await expect.poll(() => sendBtn.isEnabled(), { timeout: 30_000 }).toBe(true);
  await sendBtn.click();
  await expect.poll(() => messages.count(), { timeout: 120_000 }).toBe(before + 1);
  await chat.waitForTimeout(500);
}

test("text turn 1 → file-attach turn 2 in the same thread succeeds without 'invalid conversation data'", async ({ page }) => {
  const participant = await prisma.participant.findUnique({
    where: { identifier: TEST_USER! },
    include: { cohort: { include: { stages: { orderBy: { order: "asc" } } } } },
  });
  if (!participant) throw new Error("test participant not found");
  const chatStage = participant.cohort.stages.find(
    (s) => (s.config as Record<string, unknown>)?.chatbot,
  );
  if (!chatStage) throw new Error("no chatbot-enabled stage");

  await login(page);
  const chat = await openChat(page);

  // Listen for the user-facing error banner that Bug B surfaced through
  // the file-upload turn 2 path. We assert later that it never appeared.
  const errorBanner = chat.getByText(/invalid conversation data|missing or invalid formatversion/i);

  await sendAndWait(chat, "hi");
  await sendAndWait(chat, "what's in this file", path.join(FIXTURES, "test-data.csv"));

  // No error banner on either turn.
  await expect(errorBanner).toHaveCount(0);

  await chat.close();

  // Poll for the persisted state to settle. `onTurnComplete` fires
  // slightly after the UI stream-close signal; on prod (cold start +
  // LLM round-trip) that gap can be longer than locally, so give the
  // poll a generous deadline.
  const deadline = Date.now() + 30_000;
  type State = { formatVersion?: number; turns?: unknown[] };
  let state: State | null = null;
  while (Date.now() < deadline) {
    const row = await prisma.chatConversation.findFirst({
      where: { participantId: participant.id, stageId: chatStage.id },
      orderBy: { id: "desc" },
    });
    state = (row?.state as State | null) ?? null;
    if (state && Array.isArray(state.turns) && state.turns.length === 2) break;
    await new Promise((r) => setTimeout(r, 250));
  }

  expect(state).toBeTruthy();
  expect(state!.formatVersion).toBe(1);
  expect(Array.isArray(state!.turns)).toBe(true);
  expect(state!.turns!.length).toBe(2);
});
