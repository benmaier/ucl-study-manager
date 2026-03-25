import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { assignApiKey } from "@/lib/key-pool";
import { appendFileSync } from "fs";
import { join } from "path";

const DEBUG_LOG = join(process.env.HOME || "/tmp", "ucl-debug.log");
function dbg(msg: string) {
  try {
    appendFileSync(DEBUG_LOG, `[login ${new Date().toISOString()}] ${msg}\n`);
  } catch {}
}

export async function POST(request: NextRequest) {
  dbg("POST /api/auth/login called");

  const body = await request.json();
  const { identifier, password } = body as { identifier?: string; password?: string };
  dbg(`identifier=${identifier}, password length=${password?.length}`);

  if (!identifier || !password) {
    dbg("Missing identifier or password");
    return NextResponse.json({ error: "Identifier and password are required." }, { status: 400 });
  }

  try {
    dbg(`Calling prisma.participant.findUnique for ${identifier}`);
    dbg(`DATABASE_URL at query time: ${process.env.DATABASE_URL?.substring(0, 50)}...`);

    const participant = await prisma.participant.findUnique({
      where: { identifier },
      include: {
        cohort: {
          include: {
            stages: { include: { files: true }, orderBy: { order: "asc" } },
          },
        },
        session: { include: { study: true } },
        progress: true,
      },
    });

    dbg(`Query returned: ${participant ? `found (id=${participant.id})` : "null"}`);

    if (!participant) {
      return NextResponse.json({ error: "Identifier not found." }, { status: 404 });
    }

    if (!participant.dbPassword || !(await bcrypt.compare(password, participant.dbPassword))) {
      dbg("Password mismatch");
      return NextResponse.json({ error: "Incorrect password." }, { status: 401 });
    }

    dbg(`Login successful for ${identifier}, cohort=${participant.cohort.cohortId}`);

    // Fetch API key from DB if cohort has AI access
    if (participant.cohort.aiAccess && participant.cohort.provider) {
      try {
        dbg(`Fetching API key for provider=${participant.cohort.provider}`);
        const apiKey = await assignApiKey(participant.id, participant.cohort.provider);
        const envKey = {
          anthropic: "ANTHROPIC_API_KEY",
          openai: "OPENAI_API_KEY",
          gemini: "GOOGLE_API_KEY",
        }[participant.cohort.provider];
        if (envKey && apiKey) {
          process.env[envKey] = apiKey;
          process.env.CHAT_PROVIDER = participant.cohort.provider;
          dbg(`Set ${envKey} and CHAT_PROVIDER=${participant.cohort.provider}`);
        }
      } catch (err) {
        dbg(`Key pool error: ${(err as Error).message}`);
        console.warn("Key pool not available, using env vars:", (err as Error).message);
      }
    }

    const response = NextResponse.json({
      id: participant.id,
      identifier: participant.identifier,
      cohort: {
        id: participant.cohort.id,
        cohortId: participant.cohort.cohortId,
        label: participant.cohort.label,
        aiAccess: participant.cohort.aiAccess,
        stages: participant.cohort.stages.map((s) => ({
          id: s.id,
          stageId: s.stageId,
          title: s.title,
          duration: s.duration,
          order: s.order,
          contentText: s.contentText,
          config: s.config,
          files: s.files.map((f) => ({
            id: f.id,
            filename: f.filename,
            description: f.description,
          })),
        })),
      },
      study: {
        id: participant.session.study.id,
        title: participant.session.study.title,
      },
      progress: participant.progress.map((p) => ({
        stageId: p.stageId,
        startedAt: p.startedAt.toISOString(),
        completedAt: p.completedAt?.toISOString() ?? null,
        responses: p.responses,
      })),
    });

    response.cookies.set("participant_id", String(participant.id), {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24,
    });

    dbg("Response sent successfully");
    return response;
  } catch (err) {
    dbg(`EXCEPTION: ${(err as Error).message}`);
    dbg(`Stack: ${(err as Error).stack?.substring(0, 500)}`);
    throw err;
  }
}
