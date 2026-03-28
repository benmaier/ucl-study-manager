import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { readFileSync, existsSync } from "fs";
import { join, extname } from "path";

const MIME_TYPES: Record<string, string> = {
  ".csv": "text/csv",
  ".py": "text/x-python",
  ".txt": "text/plain",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".pdf": "application/pdf",
};

/**
 * Serve generated artifacts.
 *
 * Priority:
 * 1. Try /tmp filesystem (current session, same serverless instance)
 * 2. Try conversation state in DB (base64Data from generatedFiles)
 * 3. Return 404
 */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string; fileId: string }> }
) {
  const { id: threadId, fileId } = await ctx.params;

  const cookieStore = await cookies();
  const participantId = cookieStore.get("participant_id")?.value;
  if (!participantId) {
    return new Response("Unauthorized", { status: 401 });
  }

  const pid = parseInt(participantId, 10);

  // 1. Try filesystem (/tmp/artifacts/{participantId}/{threadId}/{fileId})
  const fsPath = join("/tmp/artifacts", String(pid), threadId, fileId);
  if (existsSync(fsPath)) {
    const data = readFileSync(fsPath);
    const ext = extname(fileId).toLowerCase();
    const mime = MIME_TYPES[ext] || "application/octet-stream";
    return new Response(data, {
      headers: {
        "Content-Type": mime,
        "Content-Disposition": `inline; filename="${fileId}"`,
      },
    });
  }

  // 2. Try DB conversation state
  const conv = await prisma.chatConversation.findUnique({
    where: {
      participantId_threadId: { participantId: pid, threadId },
    },
    select: { state: true },
  });

  if (conv?.state) {
    const state = conv.state as Record<string, unknown>;
    const turns = (state.turns as Array<Record<string, unknown>>) || [];

    for (const turn of turns) {
      const files = (turn.generatedFiles as Array<Record<string, unknown>>) || [];
      for (const file of files) {
        const filename = file.filename as string;
        const base64 = file.base64Data as string;

        // Match by filename or fileId
        if ((filename === fileId || filename?.endsWith(fileId)) && base64) {
          const buffer = Buffer.from(base64, "base64");
          const ext = extname(filename).toLowerCase();
          const mime = (file.mimeType as string) || MIME_TYPES[ext] || "application/octet-stream";
          return new Response(buffer, {
            headers: {
              "Content-Type": mime,
              "Content-Disposition": `inline; filename="${filename}"`,
            },
          });
        }
      }
    }
  }

  // 3. Also check chat_file_logs for base64 data
  const fileLogs = await prisma.chatFileLog.findMany({
    where: {
      chatLog: { participantId: pid },
      filename: { contains: fileId },
      base64Data: { not: null },
    },
    select: { filename: true, base64Data: true, mimeType: true },
    take: 1,
  });

  if (fileLogs.length > 0 && fileLogs[0].base64Data) {
    const fl = fileLogs[0];
    const buffer = Buffer.from(fl.base64Data!, "base64");
    const ext = extname(fl.filename).toLowerCase();
    const mime = fl.mimeType || MIME_TYPES[ext] || "application/octet-stream";
    return new Response(buffer, {
      headers: {
        "Content-Type": mime,
        "Content-Disposition": `inline; filename="${fl.filename}"`,
      },
    });
  }

  return new Response("File not found. Generated files from previous sessions may no longer be available.", {
    status: 404,
  });
}
