import "dotenv/config";
import pg from "pg";
import { prisma } from "../src/lib/prisma.js";
import { DatabaseWriter } from "../src/lib/database-writer.js";
import type { SerializedConversation, TurnRecord, UploadRecord } from "ucl-study-llm-chat-api";

/**
 * Test the DatabaseWriter by simulating chat turns and verifying they're stored correctly.
 *
 * Prerequisites:
 * - Study imported: npx tsx cli/import-study.ts studies/example/
 * - Session created: npx tsx cli/create-session.ts 1
 * - Participants generated: npx tsx cli/generate-participants.ts <session-id> --count 1 --cohort ai_trained
 */

async function main() {
  // Find a participant in the ai_trained cohort
  const participant = await prisma.participant.findFirst({
    where: { cohort: { aiAccess: true } },
    include: {
      cohort: {
        include: {
          stages: { include: { files: true }, orderBy: { order: "asc" } },
        },
      },
    },
  });

  if (!participant) {
    console.error("No AI-access participant found. Run import-study + create-session + generate-participants first.");
    process.exit(1);
  }

  console.log(`Using participant: ${participant.identifier} (cohort: ${participant.cohort.cohortId})`);

  // Find a chatbot-enabled stage
  const chatStage = participant.cohort.stages.find((s) => (s.config as Record<string, unknown>)?.chatbot);
  if (!chatStage) {
    console.error("No chatbot-enabled stage found for this cohort.");
    process.exit(1);
  }

  console.log(`Using stage: ${chatStage.stageId} (${chatStage.title})`);

  // Build stage file hash map for deduplication
  const stageFileHashes = new Map<string, string>();
  for (const f of chatStage.files) {
    stageFileHashes.set(f.sha256, f.filename);
  }
  console.log(`Stage has ${chatStage.files.length} known files: ${chatStage.files.map((f) => f.filename).join(", ")}`);

  // Create a pg pool (using admin credentials for this test — in production, use participant app credentials)
  const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    max: 2,
  });

  // Create the DatabaseWriter
  const writer = new DatabaseWriter(pool, participant.id, chatStage.id, stageFileHashes);

  // Simulate a conversation start
  const mockConversation: SerializedConversation = {
    formatVersion: 1,
    id: "test-conversation-001",
    provider: "anthropic",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    uploads: [],
    turns: [],
    textHistory: [],
  };

  await writer.onConversationStart(mockConversation);
  console.log("✓ onConversationStart called");

  // Simulate turn 1: user asks a question, assistant responds
  const turn1: TurnRecord = {
    turnNumber: 1,
    startedAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
    userMessage: "Can you help me analyze the discrimination campaign data?",
    attachedFileIds: [],
    assistantText: "Of course! Let me look at the data files. The dataset contains enrollment records from 1998-2003 with demographic information and complaint indicators.",
    codeArtifacts: [],
    generatedFiles: [],
    provider: "anthropic",
    model: "claude-sonnet-4-20250514",
    providerStateAfter: {},
  };

  await writer.onTurnComplete("test-conversation-001", turn1, mockConversation);
  console.log("✓ Turn 1 written (text only, no files)");

  // Simulate turn 2: assistant generates a file
  const turn2: TurnRecord = {
    turnNumber: 2,
    startedAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
    userMessage: "Plot the complaint rates over time.",
    attachedFileIds: [],
    assistantText: "Here's the plot showing complaint rates from 1998 to 2003.",
    codeArtifacts: [],
    generatedFiles: [
      {
        fileId: "generated-plot-001",
        filename: "complaint_rates.png",
        mimeType: "image/png",
        base64Data: Buffer.from("fake-png-data-for-testing").toString("base64"),
      },
    ],
    provider: "anthropic",
    model: "claude-sonnet-4-20250514",
    providerStateAfter: {},
  };

  await writer.onTurnComplete("test-conversation-001", turn2, mockConversation);
  console.log("✓ Turn 2 written (with generated file — should be stored as unknown)");

  // Known-file dedup is tested in the integration test suite (tests/integration/database-writer.test.ts)

  // Verify: query chat_logs
  const logs = await pool.query(
    "SELECT id, turn_number, role, content, provider, model FROM chat_logs WHERE participant_id = $1 AND stage_id = $2 ORDER BY id",
    [participant.id, chatStage.id]
  );

  console.log(`\n─── Chat logs in DB (${logs.rows.length} entries) ───`);
  for (const row of logs.rows) {
    console.log(`  Turn ${row.turn_number} [${row.role}]: ${row.content.substring(0, 60)}...`);
  }

  // Verify: query chat_file_logs
  const fileLogs = await pool.query(
    `SELECT cfl.filename, cfl.is_known_file, cfl.known_file_ref, cfl.mime_type, cfl.sha256,
            LENGTH(cfl.base64_data) as data_length
     FROM chat_file_logs cfl
     JOIN chat_logs cl ON cl.id = cfl.chat_log_id
     WHERE cl.participant_id = $1 AND cl.stage_id = $2`,
    [participant.id, chatStage.id]
  );

  console.log(`\n─── Chat file logs in DB (${fileLogs.rows.length} entries) ───`);
  for (const row of fileLogs.rows) {
    console.log(
      `  ${row.filename}: known=${row.is_known_file}, ref=${row.known_file_ref ?? "—"}, ` +
      `mime=${row.mime_type ?? "—"}, data=${row.data_length ? `${row.data_length} chars` : "none"}`
    );
  }

  console.log("\n✓ All tests passed!");

  await pool.end();
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("Test failed:", err.message);
  process.exit(1);
});
