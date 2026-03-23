import "dotenv/config";
import { readFileSync } from "fs";
import pg from "pg";
import { PrismaClient } from "@prisma/client";
import { DatabaseWriter } from "../src/lib/database-writer.js";
import type { SerializedConversation, TurnRecord } from "ucl-study-llm-chat-api";

/**
 * Replay a real conversation from ucl-study-llm-chat-frontend through the DatabaseWriter.
 * Uses an actual saved conversation JSON with code execution and generated files.
 */

const CONVERSATION_PATH =
  "/Users/bfmaier/Dropbox/business/projects_and_clients/UCL_london_maria/ucl-study-llm-chat-frontend/data/conversations/__LOCALID_tajaUYP/conversation.json";

const prisma = new PrismaClient();

async function main() {
  // Load the real conversation
  const raw = JSON.parse(readFileSync(CONVERSATION_PATH, "utf-8")) as SerializedConversation;
  console.log(`Loaded conversation: ${raw.id} (${raw.provider})`);
  console.log(`  Turns: ${raw.turns.length}`);
  console.log(`  Text history: ${raw.textHistory.length} entries`);

  // Find a participant + chatbot stage to log against
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

  const chatStage = participant.cohort.stages.find((s) => s.chatbot && s.files.length > 0)
    ?? participant.cohort.stages.find((s) => s.chatbot);

  if (!chatStage) {
    console.error("No chatbot-enabled stage found.");
    process.exit(1);
  }

  console.log(`\nReplaying as participant: ${participant.identifier}`);
  console.log(`  Cohort: ${participant.cohort.cohortId}`);
  console.log(`  Stage: ${chatStage.stageId} (${chatStage.title})`);
  console.log(`  Stage files: ${chatStage.files.map((f) => f.filename).join(", ") || "(none)"}`);

  // Build stage file hash map
  const stageFileHashes = new Map<string, string>();
  for (const f of chatStage.files) {
    stageFileHashes.set(f.sha256, f.filename);
  }

  // Connect to DB
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 2 });

  // Clean previous test data for this participant+stage
  await pool.query(
    "DELETE FROM chat_file_logs WHERE chat_log_id IN (SELECT id FROM chat_logs WHERE participant_id = $1 AND stage_id = $2)",
    [participant.id, chatStage.id]
  );
  await pool.query(
    "DELETE FROM chat_logs WHERE participant_id = $1 AND stage_id = $2",
    [participant.id, chatStage.id]
  );

  // Create the writer
  const writer = new DatabaseWriter(pool, participant.id, chatStage.id, stageFileHashes);

  // Replay: onConversationStart
  await writer.onConversationStart(raw);
  console.log("\n--- Replaying turns ---");

  // Replay each turn
  for (const turn of raw.turns) {
    console.log(`\nTurn ${turn.turnNumber}:`);
    console.log(`  User: ${turn.userMessage.substring(0, 80).replace(/\n/g, " ")}...`);
    console.log(`  Assistant: ${turn.assistantText.substring(0, 80).replace(/\n/g, " ")}...`);
    console.log(`  Code artifacts: ${turn.codeArtifacts.length}`);
    console.log(`  Generated files: ${turn.generatedFiles.length}`);

    for (const f of turn.generatedFiles) {
      console.log(`    → ${f.filename} (${f.mimeType ?? "unknown"}, ${f.base64Data ? `${f.base64Data.length} chars base64` : "no data"})`);
    }

    await writer.onTurnComplete(raw.id, turn, raw);
    console.log(`  ✓ Written to DB`);
  }

  // Verify: query what's in the DB
  const logs = await pool.query(
    `SELECT id, turn_number, role,
            SUBSTRING(content, 1, 80) as content_preview,
            provider, model, created_at
     FROM chat_logs
     WHERE participant_id = $1 AND stage_id = $2
     ORDER BY id`,
    [participant.id, chatStage.id]
  );

  console.log(`\n--- DB Results: chat_logs (${logs.rows.length} rows) ---`);
  for (const row of logs.rows) {
    console.log(`  Turn ${row.turn_number} [${row.role}] (${row.provider}): ${row.content_preview.replace(/\n/g, " ")}...`);
  }

  const fileLogs = await pool.query(
    `SELECT cfl.filename, cfl.is_known_file, cfl.known_file_ref, cfl.mime_type, cfl.sha256,
            LENGTH(cfl.base64_data) as data_chars
     FROM chat_file_logs cfl
     JOIN chat_logs cl ON cl.id = cfl.chat_log_id
     WHERE cl.participant_id = $1 AND cl.stage_id = $2
     ORDER BY cfl.id`,
    [participant.id, chatStage.id]
  );

  console.log(`\n--- DB Results: chat_file_logs (${fileLogs.rows.length} rows) ---`);
  for (const row of fileLogs.rows) {
    if (row.is_known_file) {
      console.log(`  ${row.filename}: KNOWN → ${row.known_file_ref} (no blob stored)`);
    } else {
      console.log(`  ${row.filename}: UNKNOWN, ${row.data_chars ?? 0} chars base64, mime=${row.mime_type}, sha256=${row.sha256?.substring(0, 16)}...`);
    }
  }

  // Summary
  console.log("\n--- Summary ---");
  console.log(`  Conversation: ${raw.id} (${raw.provider}, ${raw.turns.length} turns)`);
  console.log(`  Chat log entries: ${logs.rows.length} (${raw.turns.length} turns × 2 messages)`);
  console.log(`  File log entries: ${fileLogs.rows.length}`);
  const knownFiles = fileLogs.rows.filter((r: { is_known_file: boolean }) => r.is_known_file).length;
  const unknownFiles = fileLogs.rows.filter((r: { is_known_file: boolean }) => !r.is_known_file).length;
  console.log(`  Known files (deduped): ${knownFiles}`);
  console.log(`  Unknown files (stored as blob): ${unknownFiles}`);
  console.log("\n✓ Real conversation replayed successfully!");

  await pool.end();
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("Failed:", err.message);
  process.exit(1);
});
