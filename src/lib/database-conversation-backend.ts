import { mkdirSync } from "fs";
import { join } from "path";
import { Conversation, ConversationWriter } from "ucl-study-llm-chat-api";
import type {
  SerializedConversation,
  TurnRecord,
  UploadRecord,
} from "ucl-study-llm-chat-api";
import type { ConversationBackend, ThreadMeta } from "ucl-chat-widget/server";
import { prisma } from "./prisma";
import { DatabaseWriter } from "./database-writer";
import pg from "pg";

/**
 * Writer that saves the full serialized conversation state to the DB
 * after each turn. This captures the state that Conversation.serialize()
 * produces (passed to onTurnComplete as the third argument).
 */
class StateWriter extends ConversationWriter {
  constructor(
    private participantId: number,
    private stageId: number,
    private threadId: string,
  ) {
    super();
  }

  async onConversationStart(conversation: SerializedConversation): Promise<void> {
    // Save initial state — but only if stageId is valid
    if (!this.stageId) return;
    try {
      await prisma.chatConversation.upsert({
        where: {
          participantId_threadId: {
            participantId: this.participantId,
            threadId: this.threadId,
          },
        },
        create: {
          threadId: this.threadId,
          participantId: this.participantId,
          stageId: this.stageId,
          provider: conversation.provider,
          state: JSON.parse(JSON.stringify(conversation)),
        },
        update: {
          state: JSON.parse(JSON.stringify(conversation)),
        },
      });
    } catch (err) {
      console.error("StateWriter.onConversationStart error:", err);
    }
  }

  async onTurnComplete(
    _conversationId: string,
    _turn: TurnRecord,
    conversation: SerializedConversation
  ): Promise<void> {
    if (!this.stageId) return;
    try {
      await prisma.chatConversation.upsert({
        where: {
          participantId_threadId: {
            participantId: this.participantId,
            threadId: this.threadId,
          },
        },
        create: {
          threadId: this.threadId,
          participantId: this.participantId,
          stageId: this.stageId,
          provider: conversation.provider,
          state: JSON.parse(JSON.stringify(conversation)),
        },
        update: {
          state: JSON.parse(JSON.stringify(conversation)),
          updatedAt: new Date(),
        },
      });
    } catch (err) {
      console.error("StateWriter.onTurnComplete error:", err);
    }
  }

  async onFileUploaded(
    _conversationId: string,
    _upload: UploadRecord
  ): Promise<void> {}
}

/**
 * Database-backed conversation backend for the chat widget.
 *
 * Stores full conversation state in `chat_conversations` table (JSONB).
 * Attaches DatabaseWriter to log turns to `chat_logs` + `chat_file_logs`.
 * Attaches StateWriter to persist conversation state after each turn.
 *
 * Keyed by participantId — each participant sees only their own threads.
 * Each thread is also linked to a stageId.
 */
export class DatabaseConversationBackend implements ConversationBackend {
  private cache = new Map<string, Conversation>();
  private pool: pg.Pool | null = null;

  constructor(
    private participantId: number,
    private stageId: number,
    private provider: "anthropic" | "openai" | "gemini",
    private apiKey: string | undefined,
    private stageFileHashes: Map<string, string> = new Map(),
    private model: string | undefined = undefined,
  ) {}

  private getPool(): pg.Pool {
    if (!this.pool) {
      this.pool = new pg.Pool({
        connectionString: process.env.DATABASE_URL,
        max: 2,
      });
    }
    return this.pool;
  }

  artifactsDirForThread(threadId: string): string {
    const dir = join("/tmp/artifacts", String(this.participantId), threadId);
    mkdirSync(dir, { recursive: true });
    return dir;
  }

  async getOrCreateConversation(threadId: string): Promise<Conversation> {
    // In-memory cache hit
    if (this.cache.has(threadId)) {
      return this.cache.get(threadId)!;
    }

    const writers: ConversationWriter[] = [
      new StateWriter(this.participantId, this.stageId, threadId),
      new DatabaseWriter(this.getPool(), this.participantId, this.stageId, this.stageFileHashes),
    ];

    // Try to resume from DB
    const existing = await prisma.chatConversation.findUnique({
      where: {
        participantId_threadId: {
          participantId: this.participantId,
          threadId,
        },
      },
    });

    let conversation: Conversation;

    if (existing?.state && typeof existing.state === "object") {
      const state = existing.state as Record<string, unknown>;
      const turns = state.turns as unknown[] | undefined;

      if (turns && turns.length > 0) {
        try {
          conversation = await Conversation.resume(state as any, {
            provider: this.provider,
            model: this.model,
            apiKey: this.apiKey,
            writers,
          });
        } catch {
          conversation = new Conversation({
            provider: this.provider,
            model: this.model,
            apiKey: this.apiKey,
            id: threadId,
            writers,
          });
        }
      } else {
        conversation = new Conversation({
          provider: this.provider,
          apiKey: this.apiKey,
          id: threadId,
          writers,
        });
      }
    } else {
      // Brand new conversation
      conversation = new Conversation({
        provider: this.provider,
        apiKey: this.apiKey,
        id: threadId,
        writers,
      });

      // Create DB record (StateWriter.onConversationStart also does this,
      // but we set the correct stageId here)
      await prisma.chatConversation.upsert({
        where: {
          participantId_threadId: {
            participantId: this.participantId,
            threadId,
          },
        },
        create: {
          threadId,
          participantId: this.participantId,
          stageId: this.stageId,
          provider: this.provider,
          state: {},
        },
        update: {},
      });
    }

    this.cache.set(threadId, conversation);
    return conversation;
  }

  async onUserMessageReceived(threadId: string, message: string): Promise<void> {
    // Store the user message in the conversation state immediately,
    // so the conversation is non-empty even before the turn completes.
    await prisma.chatConversation.update({
      where: {
        participantId_threadId: {
          participantId: this.participantId,
          threadId,
        },
      },
      data: {
        state: {
          _pendingUserMessage: message,
          _pendingAt: new Date().toISOString(),
        },
      },
    });
  }

  async listThreads(): Promise<{ threads: ThreadMeta[] }> {
    const conversations = await prisma.chatConversation.findMany({
      where: { participantId: this.participantId, stageId: this.stageId },
      orderBy: { createdAt: "asc" },
    });

    // Clean up truly empty conversations (no turns AND no pending user message).
    // Conversations mid-stream have a _pendingUserMessage, so they won't be deleted.
    const empty = conversations.filter((c) => {
      const state = c.state as Record<string, unknown> | null;
      if (!state) return true;
      const turns = state.turns as unknown[] | undefined;
      const hasTurns = turns && turns.length > 0;
      const hasPending = !!state._pendingUserMessage;
      return !hasTurns && !hasPending;
    });
    if (empty.length > 0) {
      await prisma.chatConversation.deleteMany({
        where: { id: { in: empty.map((c) => c.id) } },
      });
    }
    const valid = conversations.filter((c) => !empty.includes(c));

    // Number by creation order
    const threads: ThreadMeta[] = valid.map((c, i) => ({
      remoteId: c.threadId,
      title: c.title || `Chat ${String(i + 1).padStart(2, "0")}`,
      status: "regular" as const,
    }));

    // Reverse so newest appears first in sidebar
    threads.reverse();

    return { threads };
  }

  async getThreadMeta(threadId: string): Promise<ThreadMeta | null> {
    const conv = await prisma.chatConversation.findUnique({
      where: {
        participantId_threadId: {
          participantId: this.participantId,
          threadId,
        },
      },
    });

    if (!conv) return null;

    // If no title, compute the number based on creation order within this stage
    let title = conv.title;
    if (!title) {
      const allConvs = await prisma.chatConversation.findMany({
        where: { participantId: this.participantId, stageId: this.stageId },
        orderBy: { createdAt: "asc" },
        select: { threadId: true },
      });
      const index = allConvs.findIndex((c) => c.threadId === threadId);
      title = `Chat ${String(index + 1).padStart(2, "0")}`;
    }

    return {
      remoteId: conv.threadId,
      title,
      status: "regular",
    };
  }

  async updateThreadTitle(threadId: string, title: string): Promise<void> {
    await prisma.chatConversation.update({
      where: {
        participantId_threadId: {
          participantId: this.participantId,
          threadId,
        },
      },
      data: { title },
    });
  }

  async getConversationData(
    threadId: string
  ): Promise<{ turns: unknown[]; uploads?: unknown[] } | null> {
    const conv = await prisma.chatConversation.findUnique({
      where: {
        participantId_threadId: {
          participantId: this.participantId,
          threadId,
        },
      },
    });

    if (!conv?.state) return null;

    const state = conv.state as Record<string, unknown>;
    return {
      turns: (state.turns as unknown[]) || [],
      uploads: (state.uploads as unknown[]) || [],
    };
  }
}
