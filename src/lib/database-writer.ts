import { createHash } from "crypto";
import type { Pool } from "pg";
import { ConversationWriter } from "ucl-study-llm-chat-api";
import type {
  SerializedConversation,
  TurnRecord,
  UploadRecord,
} from "ucl-study-llm-chat-api";

/**
 * ConversationWriter that logs chat turns to PostgreSQL.
 *
 * Writes to chat_logs and chat_file_logs tables.
 * Deduplicates files: if a file's SHA-256 matches a known stage file,
 * stores only the filename reference instead of the full base64 blob.
 */
export class DatabaseWriter extends ConversationWriter {
  constructor(
    private pool: Pool,
    private participantId: number,
    private stageId: number,
    /** Map of SHA-256 hash → filename for known stage files */
    private stageFileHashes: Map<string, string>
  ) {
    super();
  }

  async onConversationStart(_conversation: SerializedConversation): Promise<void> {
    // No-op — conversation is implicit via chat_log entries
  }

  async onTurnComplete(
    conversationId: string,
    turn: TurnRecord,
    _conversation: SerializedConversation
  ): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");

      // Insert user message
      const userResult = await client.query(
        `INSERT INTO chat_logs (conversation_id, participant_id, stage_id, turn_number, role, content, provider, model, created_at)
         VALUES ($1, $2, $3, $4, 'user', $5, $6, $7, $8)
         RETURNING id`,
        [
          conversationId,
          this.participantId,
          this.stageId,
          turn.turnNumber,
          turn.userMessage,
          turn.provider,
          turn.model ?? null,
          turn.startedAt,
        ]
      );
      const userLogId = userResult.rows[0].id;

      // Log files attached to the user message
      for (const fileId of turn.attachedFileIds) {
        // Find the upload record in the conversation to get the file data
        // For now, just log the file ID reference
        await client.query(
          `INSERT INTO chat_file_logs (chat_log_id, filename, is_known_file, sha256)
           VALUES ($1, $2, false, NULL)`,
          [userLogId, fileId]
        );
      }

      // Insert assistant message
      const assistantResult = await client.query(
        `INSERT INTO chat_logs (conversation_id, participant_id, stage_id, turn_number, role, content, provider, model, created_at)
         VALUES ($1, $2, $3, $4, 'assistant', $5, $6, $7, $8)
         RETURNING id`,
        [
          conversationId,
          this.participantId,
          this.stageId,
          turn.turnNumber,
          turn.assistantText,
          turn.provider,
          turn.model ?? null,
          turn.completedAt,
        ]
      );
      const assistantLogId = assistantResult.rows[0].id;

      // Log generated files with deduplication
      for (const file of turn.generatedFiles) {
        const base64 = file.base64Data;
        let isKnown = false;
        let knownFileRef: string | null = null;
        let sha256: string | null = null;

        if (base64) {
          sha256 = createHash("sha256")
            .update(Buffer.from(base64, "base64"))
            .digest("hex");
          const knownName = this.stageFileHashes.get(sha256);
          if (knownName) {
            isKnown = true;
            knownFileRef = knownName;
          }
        }

        await client.query(
          `INSERT INTO chat_file_logs (chat_log_id, filename, is_known_file, known_file_ref, base64_data, mime_type, sha256)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            assistantLogId,
            file.filename,
            isKnown,
            knownFileRef,
            isKnown ? null : base64, // don't store blob for known files
            file.mimeType ?? null,
            sha256,
          ]
        );
      }

      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }

  async onFileUploaded(
    _conversationId: string,
    upload: UploadRecord
  ): Promise<void> {
    // File uploads are logged when they appear in a turn (onTurnComplete).
    // This callback fires before the turn, so we skip it to avoid duplicates.
  }
}
