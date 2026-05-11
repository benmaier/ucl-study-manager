/**
 * Regression: the cohort's configured model must propagate into the
 * first chat turn — previously DatabaseConversationBackend constructed
 * the brand-new Conversation without `model`, so the SDK fell back to
 * its hardcoded default and `cohort.model` was silently ignored on
 * turn 1.
 *
 * After sending one message we read the assistant chat_log row and
 * assert its `model` column matches the cohort's configured model.
 * Without the fix this column is NULL.
 */
import "dotenv/config";
import { test, expect, type Page } from "@playwright/test";
import { prisma } from "../src/lib/prisma";
import { resetSharedUser } from "./lib/reset-shared-user";

const TEST_USER = process.env.TEST_USER;
const TEST_PASS = process.env.TEST_PASS;

if (!TEST_USER || !TEST_PASS) {
  throw new Error("Set TEST_USER and TEST_PASS env vars");
}

test.setTimeout(120_000);

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

test("first chat turn records the cohort's model on chat_logs", async ({ page }) => {
  await login(page);

  // Resolve the cohort + stage the participant is currently on so we
  // know what model to expect. The test user's first chatbot stage on
  // the chatbot_test cohort uses claude-haiku-4-5-20251001.
  const participant = await prisma.participant.findUnique({
    where: { identifier: TEST_USER! },
    include: { cohort: { include: { stages: { orderBy: { order: "asc" } } } } },
  });
  if (!participant) throw new Error("test participant not found in DB");
  const chatStage = participant.cohort.stages.find(
    (s) => (s.config as Record<string, unknown>)?.chatbot,
  );
  if (!chatStage) throw new Error("no chatbot-enabled stage on this cohort");
  const stageCfg = chatStage.config as Record<string, unknown>;
  const expectedModel =
    (stageCfg.model as string | undefined) ?? participant.cohort.model!;
  if (!expectedModel) throw new Error("no model configured on cohort or stage");

  // Send a one-shot text message in the chat widget.
  const chat = await openChat(page);
  await chat.bringToFront();
  const messages = chat.locator(".aui-assistant-message-root");
  const input = chat.locator(".aui-composer-input");
  await input.click();
  await input.pressSequentially("hi", { delay: 10 });
  await chat.waitForTimeout(300);
  // Click the send button rather than rely on Enter (more reliable on
  // the assistant-ui composer) and wait for an actual assistant message
  // to appear rather than the send-icon toggle (which is misleading).
  const sendBtn = chat.locator(".aui-composer-send");
  await expect.poll(() => sendBtn.isEnabled(), { timeout: 10_000 }).toBe(true);
  await sendBtn.click();
  await expect.poll(() => messages.count(), { timeout: 120_000 }).toBe(1);
  await chat.waitForTimeout(500);
  await chat.close();

  // Poll for the assistant chat_log row. The DB write via
  // `onTurnComplete` runs slightly after the UI signal — and on prod
  // (cold start + LLM round-trip) that gap can be longer than locally,
  // so give it a generous deadline.
  const deadline = Date.now() + 30_000;
  let log: { model: string | null } | null = null;
  while (Date.now() < deadline) {
    log = await prisma.chatLog.findFirst({
      where: {
        participantId: participant.id,
        stageId: chatStage.id,
        role: "assistant",
      },
      orderBy: { id: "desc" },
    });
    if (log) break;
    await new Promise((r) => setTimeout(r, 250));
  }
  expect(log).toBeTruthy();
  expect(log!.model).toBe(expectedModel);
});
