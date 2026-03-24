import { describe, it, expect, beforeAll, afterAll } from "vitest";
import "dotenv/config";
import pg from "pg";
import { PrismaClient } from "@prisma/client";
import { createHash } from "crypto";
import { DatabaseWriter } from "../../src/lib/database-writer.js";
import type { SerializedConversation, TurnRecord } from "ucl-study-llm-chat-api";

const prisma = new PrismaClient();
let pool: pg.Pool;
let participantId: number;
let stageId: number;
let stageFileHashes: Map<string, string>;

const KNOWN_FILE_CONTENT = "known-file-content-for-testing";
const KNOWN_FILE_HASH = createHash("sha256").update(KNOWN_FILE_CONTENT).digest("hex");

beforeAll(async () => {
  pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 2 });

  // Find or create test data: we need a participant + a stage with a known file hash
  const participant = await prisma.participant.findFirst({
    where: { cohort: { aiAccess: true } },
    include: {
      cohort: {
        include: { stages: { include: { files: true }, orderBy: { order: "asc" } } },
      },
    },
  });

  if (!participant) {
    throw new Error(
      "No AI-access participant found. Run: import-study, create-session, generate-participants first."
    );
  }

  const chatStage = participant.cohort.stages.find((s) => (s.config as Record<string, unknown>)?.chatbot);
  if (!chatStage) {
    throw new Error("No chatbot-enabled stage found.");
  }

  participantId = participant.id;
  stageId = chatStage.id;

  // Build hash map from actual stage files + add our test hash
  stageFileHashes = new Map<string, string>();
  for (const f of chatStage.files) {
    stageFileHashes.set(f.sha256, f.filename);
  }
  stageFileHashes.set(KNOWN_FILE_HASH, "test-known-file.txt");

  // Clean up any previous test data for this participant+stage
  await pool.query("DELETE FROM chat_file_logs WHERE chat_log_id IN (SELECT id FROM chat_logs WHERE participant_id = $1 AND stage_id = $2)", [participantId, stageId]);
  await pool.query("DELETE FROM chat_logs WHERE participant_id = $1 AND stage_id = $2", [participantId, stageId]);
});

afterAll(async () => {
  // Clean up test data
  await pool.query("DELETE FROM chat_file_logs WHERE chat_log_id IN (SELECT id FROM chat_logs WHERE participant_id = $1 AND stage_id = $2)", [participantId, stageId]);
  await pool.query("DELETE FROM chat_logs WHERE participant_id = $1 AND stage_id = $2", [participantId, stageId]);
  await pool.end();
  await prisma.$disconnect();
});

function mockConversation(): SerializedConversation {
  return {
    formatVersion: 1,
    id: "test-conv",
    provider: "anthropic",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    uploads: [],
    turns: [],
    textHistory: [],
  };
}

describe("DatabaseWriter", () => {
  it("writes a text-only turn to chat_logs", async () => {
    const writer = new DatabaseWriter(pool, participantId, stageId, stageFileHashes);
    await writer.onConversationStart(mockConversation());

    const turn: TurnRecord = {
      turnNumber: 1,
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      userMessage: "Hello, can you help?",
      attachedFileIds: [],
      assistantText: "Sure, I can help with that.",
      codeArtifacts: [],
      generatedFiles: [],
      provider: "anthropic",
      model: "claude-sonnet-4-20250514",
      providerStateAfter: {},
    };

    await writer.onTurnComplete("test-conv", turn, mockConversation());

    const result = await pool.query(
      "SELECT role, content, turn_number, provider, model FROM chat_logs WHERE participant_id = $1 AND stage_id = $2 ORDER BY id",
      [participantId, stageId]
    );

    expect(result.rows.length).toBe(2);
    expect(result.rows[0].role).toBe("user");
    expect(result.rows[0].content).toBe("Hello, can you help?");
    expect(result.rows[0].turn_number).toBe(1);
    expect(result.rows[0].provider).toBe("anthropic");
    expect(result.rows[0].model).toBe("claude-sonnet-4-20250514");
    expect(result.rows[1].role).toBe("assistant");
    expect(result.rows[1].content).toBe("Sure, I can help with that.");
  });

  it("stores unknown generated files as base64 blobs", async () => {
    const writer = new DatabaseWriter(pool, participantId, stageId, stageFileHashes);
    const unknownData = Buffer.from("unknown-file-data").toString("base64");

    const turn: TurnRecord = {
      turnNumber: 2,
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      userMessage: "Generate a plot",
      attachedFileIds: [],
      assistantText: "Here is the plot.",
      codeArtifacts: [],
      generatedFiles: [
        {
          fileId: "gen-001",
          filename: "plot.png",
          mimeType: "image/png",
          base64Data: unknownData,
        },
      ],
      provider: "anthropic",
      providerStateAfter: {},
    };

    await writer.onTurnComplete("test-conv", turn, mockConversation());

    const files = await pool.query(
      `SELECT cfl.filename, cfl.is_known_file, cfl.known_file_ref, cfl.base64_data, cfl.mime_type, cfl.sha256
       FROM chat_file_logs cfl
       JOIN chat_logs cl ON cl.id = cfl.chat_log_id
       WHERE cl.participant_id = $1 AND cl.stage_id = $2 AND cfl.filename = 'plot.png'`,
      [participantId, stageId]
    );

    expect(files.rows.length).toBe(1);
    expect(files.rows[0].is_known_file).toBe(false);
    expect(files.rows[0].known_file_ref).toBeNull();
    expect(files.rows[0].base64_data).toBe(unknownData);
    expect(files.rows[0].mime_type).toBe("image/png");
    expect(files.rows[0].sha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it("deduplicates known files by SHA-256 hash", async () => {
    const writer = new DatabaseWriter(pool, participantId, stageId, stageFileHashes);
    const knownBase64 = Buffer.from(KNOWN_FILE_CONTENT).toString("base64");

    const turn: TurnRecord = {
      turnNumber: 3,
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      userMessage: "Show original file",
      attachedFileIds: [],
      assistantText: "Here is the original.",
      codeArtifacts: [],
      generatedFiles: [
        {
          fileId: "known-001",
          filename: "output.txt",
          mimeType: "text/plain",
          base64Data: knownBase64,
        },
      ],
      provider: "anthropic",
      providerStateAfter: {},
    };

    await writer.onTurnComplete("test-conv", turn, mockConversation());

    const files = await pool.query(
      `SELECT cfl.filename, cfl.is_known_file, cfl.known_file_ref, cfl.base64_data, cfl.sha256
       FROM chat_file_logs cfl
       JOIN chat_logs cl ON cl.id = cfl.chat_log_id
       WHERE cl.participant_id = $1 AND cl.stage_id = $2 AND cfl.filename = 'output.txt'`,
      [participantId, stageId]
    );

    expect(files.rows.length).toBe(1);
    expect(files.rows[0].is_known_file).toBe(true);
    expect(files.rows[0].known_file_ref).toBe("test-known-file.txt");
    expect(files.rows[0].base64_data).toBeNull(); // no blob stored for known files
    expect(files.rows[0].sha256).toBe(KNOWN_FILE_HASH);
  });

  it("handles multiple turns with correct turn numbers", async () => {
    // Clean slate
    await pool.query("DELETE FROM chat_file_logs WHERE chat_log_id IN (SELECT id FROM chat_logs WHERE participant_id = $1 AND stage_id = $2)", [participantId, stageId]);
    await pool.query("DELETE FROM chat_logs WHERE participant_id = $1 AND stage_id = $2", [participantId, stageId]);

    const writer = new DatabaseWriter(pool, participantId, stageId, stageFileHashes);

    for (let i = 1; i <= 3; i++) {
      await writer.onTurnComplete(
        "test-conv",
        {
          turnNumber: i,
          startedAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
          userMessage: `Question ${i}`,
          attachedFileIds: [],
          assistantText: `Answer ${i}`,
          codeArtifacts: [],
          generatedFiles: [],
          provider: "anthropic",
          providerStateAfter: {},
        },
        mockConversation()
      );
    }

    const result = await pool.query(
      "SELECT turn_number, role, content FROM chat_logs WHERE participant_id = $1 AND stage_id = $2 ORDER BY id",
      [participantId, stageId]
    );

    expect(result.rows.length).toBe(6); // 3 turns × 2 messages each
    expect(result.rows[0]).toMatchObject({ turn_number: 1, role: "user", content: "Question 1" });
    expect(result.rows[1]).toMatchObject({ turn_number: 1, role: "assistant", content: "Answer 1" });
    expect(result.rows[4]).toMatchObject({ turn_number: 3, role: "user", content: "Question 3" });
    expect(result.rows[5]).toMatchObject({ turn_number: 3, role: "assistant", content: "Answer 3" });
  });
});
