/**
 * Integration tests for DatabaseConversationBackend.
 *
 * Focuses on the fallback paths: model-scrub on cross-provider resume,
 * cache eviction so the widget doesn't keep retrying the failing primary,
 * and the audit row written by onFallbackUsed.
 *
 * Hits a real DB (uses DATABASE_URL from .env). Picks an existing AI-access
 * participant + chatbot stage, namespaces threadIds with a per-test prefix,
 * and cleans up its own rows in afterAll.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import type { SerializedConversation } from "ucl-study-llm-chat-api";
import { DatabaseConversationBackend } from "../../src/lib/database-conversation-backend.js";

const prisma = new PrismaClient();
let participantId: number;
let stageId: number;

const RUN_ID = `dbcb-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
const FAKE_PRIMARY_MODEL = "claude-fake-id-that-does-not-exist";

beforeAll(async () => {
  const participant = await prisma.participant.findFirst({
    where: { cohort: { provider: { not: null } } },
    include: { cohort: { include: { stages: { orderBy: { order: "asc" } } } } },
  });
  if (!participant) {
    throw new Error(
      "No AI-access participant found. Run import-study + create-session + generate-participants first."
    );
  }
  const chatStage = participant.cohort.stages.find(
    (s) => (s.config as Record<string, unknown>)?.chatbot
  );
  if (!chatStage) throw new Error("No chatbot-enabled stage found");

  participantId = participant.id;
  stageId = chatStage.id;
});

afterAll(async () => {
  // Wipe any rows we created. Threads use the RUN_ID prefix, fallback_events
  // are matched by participant+stage and recent timestamp.
  await prisma.chatConversation.deleteMany({
    where: { threadId: { startsWith: RUN_ID } },
  });
  await prisma.fallbackEvent.deleteMany({
    where: {
      participantId,
      stageId,
      threadId: { startsWith: RUN_ID },
    },
  });
  await prisma.$disconnect();
});

function seedState(
  provider: "anthropic" | "openai" | "gemini",
  model: string,
  withTurn = false,
): SerializedConversation {
  const turns = withTurn
    ? [
        {
          turnNumber: 1,
          startedAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
          userMessage: "hi",
          attachedFileIds: [],
          assistantText: "hello",
          codeArtifacts: [],
          generatedFiles: [],
          provider,
          model,
          providerStateAfter: {},
        },
      ]
    : [];
  const textHistory = withTurn
    ? [
        { role: "user" as const, content: "hi" },
        { role: "assistant" as const, content: "hello" },
      ]
    : [];
  return {
    formatVersion: 1,
    id: "fixture-conv-id",
    provider,
    model,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    uploads: [],
    turns,
    textHistory,
  } as unknown as SerializedConversation;
}

async function seedThread(threadId: string, state: SerializedConversation): Promise<void> {
  await prisma.chatConversation.create({
    data: {
      threadId,
      participantId,
      stageId,
      provider: state.provider,
      state: JSON.parse(JSON.stringify(state)),
    },
  });
}

describe("DatabaseConversationBackend", () => {
  it("createFallbackConversation scrubs the primary's model when crossing providers", async () => {
    const threadId = `${RUN_ID}-scrub`;
    await seedThread(threadId, seedState("anthropic", FAKE_PRIMARY_MODEL));

    const backend = new DatabaseConversationBackend(
      participantId,
      stageId,
      "anthropic",
      "fake-anthropic-key",
    );

    const fallback = await backend.createFallbackConversation(threadId, "openai");

    expect(fallback.getProvider()).toBe("openai");

    // Reach into the private `model` field — the SDK doesn't expose a
    // getter, but a private cast is enough to verify the bug pattern:
    // without the scrub this would carry "claude-fake-..." into OpenAI.
    const fallbackModel = (fallback as unknown as { model?: string }).model;
    expect(fallbackModel).not.toBe(FAKE_PRIMARY_MODEL);
  });

  it("createFallbackConversation flips the in-process cache", async () => {
    const threadId = `${RUN_ID}-cache`;
    await seedThread(threadId, seedState("anthropic", FAKE_PRIMARY_MODEL));

    const backend = new DatabaseConversationBackend(
      participantId,
      stageId,
      "anthropic",
      "fake-anthropic-key",
    );

    const primary = await backend.getOrCreateConversation(threadId);
    expect(primary.getProvider()).toBe("anthropic");

    const fallback = await backend.createFallbackConversation(threadId, "openai");
    expect(fallback.getProvider()).toBe("openai");

    // After the fallback flip, the cache should hand back the fallback —
    // not the primary that's still hitting a 404.
    const next = await backend.getOrCreateConversation(threadId);
    expect(next).toBe(fallback);
    expect(next.getProvider()).toBe("openai");
  });

  it("getOrCreateConversation sticks to the saved provider after a cold start", async () => {
    // Simulates a Vercel function recycle: the previous request flipped
    // the thread to OpenAI, persisted state with provider="openai", and
    // the function instance died. A new request comes in with a fresh
    // backend instance whose `this.provider` is the cohort's primary
    // (still anthropic). The DB is the only memory of the flip. We need
    // resume() to honor the saved provider — otherwise every cold start
    // re-tries the broken primary and the user sees errors forever.
    const threadId = `${RUN_ID}-sticky`;
    await seedThread(
      threadId,
      seedState("openai", "gpt-4o-mini-fixture", /* withTurn */ true),
    );

    const backend = new DatabaseConversationBackend(
      participantId,
      stageId,
      "anthropic",
      "fake-anthropic-key",
    );

    const resumed = await backend.getOrCreateConversation(threadId);
    expect(resumed.getProvider()).toBe("openai");
  });

  it("onFallbackUsed writes exactly one fallback_events row with the right fields", async () => {
    const threadId = `${RUN_ID}-event`;
    await seedThread(threadId, seedState("anthropic", FAKE_PRIMARY_MODEL));

    const backend = new DatabaseConversationBackend(
      participantId,
      stageId,
      "anthropic",
      "fake-anthropic-key",
    );

    // Need to populate the cache with the fallback so onFallbackUsed can
    // read its provider.
    await backend.createFallbackConversation(threadId, "openai");

    const before = await prisma.fallbackEvent.count({ where: { threadId } });
    expect(before).toBe(0);

    await backend.onFallbackUsed(threadId, "send-error", new Error("primary 404"));

    const rows = await prisma.fallbackEvent.findMany({ where: { threadId } });
    expect(rows.length).toBe(1);
    const row = rows[0];
    expect(row.participantId).toBe(participantId);
    expect(row.stageId).toBe(stageId);
    expect(row.reason).toBe("send-error");
    expect(row.primaryProvider).toBe("anthropic");
    expect(row.fallbackProvider).toBe("openai");
    expect(row.primaryErrorMessage).toBe("primary 404");
    expect(Date.now() - row.createdAt.getTime()).toBeLessThan(10_000);
  });
});
