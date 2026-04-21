/**
 * Tests the main-app side of the mid-conversation fallback flow —
 * DatabaseConversationBackend.createFallbackConversation.
 *
 * This doesn't exercise the widget's failure-detection logic; that lives in
 * ucl-chat-widget and is tested there. What this covers is our contract:
 * given a persisted thread state, createFallbackConversation returns a
 * Conversation on the requested fallback provider and the in-process cache
 * points at that instance.
 *
 * Conversation.resume() does not make an LLM API call, so this is cheap and
 * deterministic — no rate limits, no stubbed keys.
 *
 * Run:
 *   TEST_USER=... TEST_PASS=... npx playwright test fallback-provider
 */

import "dotenv/config";
import { test, expect } from "@playwright/test";
import { prisma } from "../src/lib/prisma";
import { DatabaseConversationBackend } from "../src/lib/database-conversation-backend";

const TEST_USER = process.env.TEST_USER;
const TEST_PASS = process.env.TEST_PASS;
if (!TEST_USER || !TEST_PASS) {
  throw new Error("Set TEST_USER / TEST_PASS env vars");
}

test.setTimeout(30_000);

test.describe("DatabaseConversationBackend.createFallbackConversation", () => {
  test("resumes thread on fallback provider + flips cache", async () => {
    const participant = await prisma.participant.findUnique({
      where: { identifier: TEST_USER! },
      include: { cohort: { include: { stages: true } }, progress: true },
    });
    if (!participant) throw new Error(`Test participant ${TEST_USER} not found`);

    const stageId = participant.cohort.stages[0]?.id;
    if (!stageId) throw new Error("Test user's cohort has no stages");

    const threadId = `fallback-test-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

    // Seed a minimal-but-valid serialized state — primary=anthropic, empty turns.
    // Mirrors the shape Conversation.serialize() would emit.
    const seedState = {
      id: threadId,
      provider: "anthropic" as const,
      turns: [],
      uploads: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      textHistory: [],
      formatVersion: 1,
    };

    await prisma.chatConversation.create({
      data: {
        participantId: participant.id,
        threadId,
        stageId,
        provider: "anthropic",
        state: seedState,
      },
    });

    try {
      const backend = new DatabaseConversationBackend(
        participant.id,
        stageId,
        "anthropic",
        undefined, // apiKey — backend resolves via pool
      );

      // Prime the cache with the primary Conversation instance.
      const primary = await backend.getOrCreateConversation(threadId);
      expect(primary).toBeDefined();
      expect(primary.getProvider()).toBe("anthropic");

      // Now do the fallback swap.
      const fallback = await backend.createFallbackConversation(
        threadId,
        "gemini",
        "gemini-2.5-flash",
      );
      expect(fallback).toBeDefined();
      expect(fallback.getProvider()).toBe("gemini");
      // Different instance from primary (not just the same object mutated).
      expect(fallback).not.toBe(primary);

      // Next getOrCreateConversation must return the fallback — the contract
      // the widget relies on to not keep hitting the failing primary.
      const afterSwap = await backend.getOrCreateConversation(threadId);
      expect(afterSwap).toBe(fallback);
      expect(afterSwap.getProvider()).toBe("gemini");
    } finally {
      await prisma.chatConversation.delete({
        where: {
          participantId_threadId: {
            participantId: participant.id,
            threadId,
          },
        },
      });
      await prisma.$disconnect();
    }
  });

  test("throws when the thread has no stored state", async () => {
    const participant = await prisma.participant.findUnique({
      where: { identifier: TEST_USER! },
      include: { cohort: { include: { stages: true } } },
    });
    if (!participant) throw new Error(`Test participant ${TEST_USER} not found`);
    const stageId = participant.cohort.stages[0]?.id;
    if (!stageId) throw new Error("Test user's cohort has no stages");

    const backend = new DatabaseConversationBackend(
      participant.id,
      stageId,
      "anthropic",
      undefined,
    );

    await expect(
      backend.createFallbackConversation(
        `nonexistent-thread-${Date.now()}`,
        "gemini",
      ),
    ).rejects.toThrow(/no stored state/);

    await prisma.$disconnect();
  });

  test("onFallbackUsed writes an audit row to fallback_events", async () => {
    const participant = await prisma.participant.findUnique({
      where: { identifier: TEST_USER! },
      include: { cohort: { include: { stages: true } } },
    });
    if (!participant) throw new Error(`Test participant ${TEST_USER} not found`);
    const stageId = participant.cohort.stages[0]?.id;
    if (!stageId) throw new Error("Test user's cohort has no stages");

    const threadId = `fallback-audit-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

    // Seed a thread so createFallbackConversation can resume it.
    const seedState = {
      id: threadId,
      provider: "anthropic" as const,
      turns: [],
      uploads: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      textHistory: [],
      formatVersion: 1,
    };
    await prisma.chatConversation.create({
      data: {
        participantId: participant.id,
        threadId,
        stageId,
        provider: "anthropic",
        state: seedState,
      },
    });

    try {
      const backend = new DatabaseConversationBackend(
        participant.id,
        stageId,
        "anthropic",
        undefined,
      );

      // Realistic ordering: widget swaps to fallback first, then fires the hook.
      await backend.createFallbackConversation(threadId, "gemini", "gemini-2.5-flash");
      await backend.onFallbackUsed(
        threadId,
        "send-error",
        new Error("Anthropic API returned 401"),
      );

      const rows = await prisma.fallbackEvent.findMany({
        where: { threadId, participantId: participant.id },
      });
      expect(rows).toHaveLength(1);
      const row = rows[0];
      expect(row.reason).toBe("send-error");
      expect(row.primaryProvider).toBe("anthropic");
      expect(row.fallbackProvider).toBe("gemini");
      expect(row.primaryErrorMessage).toBe("Anthropic API returned 401");
      expect(row.stageId).toBe(stageId);
    } finally {
      // Order matters — fallback_events FK cascades from participant, not
      // from chat_conversation, so deleting the ChatConversation alone
      // leaves the audit row behind. Clean it up explicitly.
      await prisma.fallbackEvent.deleteMany({
        where: { threadId, participantId: participant.id },
      });
      await prisma.chatConversation.delete({
        where: {
          participantId_threadId: {
            participantId: participant.id,
            threadId,
          },
        },
      });
      await prisma.$disconnect();
    }
  });
});
