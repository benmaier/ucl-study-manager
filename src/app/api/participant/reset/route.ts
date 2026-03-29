import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";

/**
 * POST /api/participant/reset
 * Test users only — deletes all progress, chat conversations, and chat logs.
 */
export async function POST() {
  const cookieStore = await cookies();
  const pid = cookieStore.get("participant_id")?.value;
  if (!pid) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const participantId = parseInt(pid, 10);

  const participant = await prisma.participant.findUnique({
    where: { id: participantId },
    select: { isTestUser: true },
  });

  if (!participant?.isTestUser) {
    return NextResponse.json({ error: "Only test users can reset" }, { status: 403 });
  }

  // Delete all progress
  await prisma.participantProgress.deleteMany({ where: { participantId } });

  // Delete chat file logs (via chat logs)
  const chatLogIds = await prisma.chatLog.findMany({
    where: { participantId },
    select: { id: true },
  });
  if (chatLogIds.length > 0) {
    await prisma.chatFileLog.deleteMany({
      where: { chatLogId: { in: chatLogIds.map((c) => c.id) } },
    });
  }

  // Delete chat logs
  await prisma.chatLog.deleteMany({ where: { participantId } });

  // Delete chat conversations
  await prisma.chatConversation.deleteMany({ where: { participantId } });

  return NextResponse.json({ ok: true });
}
