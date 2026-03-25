import "dotenv/config";
import pg from "pg";

let pool: pg.Pool | null = null;

function getPool(): pg.Pool {
  if (!pool) {
    pool = new pg.Pool({
      connectionString: process.env.DATABASE_URL,
      max: 2,
    });
  }
  return pool;
}

/**
 * Fetch an API key for a participant's cohort from the database.
 * Uses the assign_api_key() SECURITY DEFINER function which:
 * - Looks up the participant's cohort
 * - Finds the least-used active key for the given provider in that cohort's pool
 * - Increments the usage counter
 * - Logs the assignment
 * - Returns the API key string
 *
 * Returns null if no key is available.
 */
export async function assignApiKey(
  participantId: number,
  provider: string
): Promise<string | null> {
  const client = await getPool().connect();
  try {
    const result = await client.query(
      "SELECT assign_api_key($1, $2) AS api_key",
      [participantId, provider]
    );
    return result.rows[0]?.api_key ?? null;
  } finally {
    client.release();
  }
}
