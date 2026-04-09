import { NextRequest, NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import pg from "pg";

function getClient() {
  return new pg.Client({ connectionString: process.env.DATABASE_URL });
}

export async function POST(request: NextRequest) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({})) as Record<string, unknown>;

  // List all keys
  if (body.action === "list") {
    const client = getClient();
    try {
      await client.connect();
      const result = await client.query(
        `SELECT id, provider, label, session_assignment_count, is_active,
                substring(api_key from 1 for 12) || '...' AS key_preview
         FROM api_keys ORDER BY provider, id`
      );
      return NextResponse.json({ keys: result.rows });
    } finally {
      await client.end();
    }
  }

  // Add a key
  if (body.action === "add") {
    const provider = body.provider as string;
    const apiKey = body.apiKey as string;

    if (!provider || !apiKey) {
      return NextResponse.json({ error: "Provider and API key are required." }, { status: 400 });
    }
    if (!["anthropic", "openai", "gemini"].includes(provider)) {
      return NextResponse.json({ error: "Provider must be anthropic, openai, or gemini." }, { status: 400 });
    }

    const client = getClient();
    try {
      await client.connect();
      const result = await client.query(
        "INSERT INTO api_keys (provider, api_key, label) VALUES ($1, $2, $3) RETURNING id",
        [provider, apiKey, `${provider}-${Date.now()}`]
      );
      return NextResponse.json({ ok: true, id: result.rows[0].id });
    } finally {
      await client.end();
    }
  }

  // Toggle active/inactive
  if (body.action === "toggle" && typeof body.keyId === "number") {
    const client = getClient();
    try {
      await client.connect();
      await client.query(
        "UPDATE api_keys SET is_active = NOT is_active WHERE id = $1",
        [body.keyId]
      );
      return NextResponse.json({ ok: true });
    } finally {
      await client.end();
    }
  }

  // Delete a key
  if (body.action === "delete" && typeof body.keyId === "number") {
    const client = getClient();
    try {
      await client.connect();
      await client.query("DELETE FROM cohort_key_pools WHERE api_key_id = $1", [body.keyId]);
      await client.query("DELETE FROM session_key_assignments WHERE api_key_id = $1", [body.keyId]);
      await client.query("DELETE FROM api_keys WHERE id = $1", [body.keyId]);
      return NextResponse.json({ ok: true });
    } finally {
      await client.end();
    }
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
