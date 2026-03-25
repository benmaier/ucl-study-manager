import "dotenv/config";
import pg from "pg";

const provider = process.argv[2];
const apiKey = process.argv[3];
const cohortIds = process.argv.slice(4);

if (!provider || !apiKey || cohortIds.length === 0) {
  console.error(
    "Usage: npx tsx cli/add-api-key.ts <provider> <api-key> <cohort-db-id> [cohort-db-id ...]"
  );
  console.error("  provider: anthropic | openai | gemini");
  console.error("  api-key: the actual API key string");
  console.error("  cohort-db-id: numeric DB IDs of cohorts to assign this key to");
  console.error("\nExample:");
  console.error("  npx tsx cli/add-api-key.ts anthropic sk-ant-... 1 2");
  process.exit(1);
}

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });

async function main() {
  await client.connect();

  // Insert the API key
  const result = await client.query(
    "INSERT INTO api_keys (provider, api_key, label) VALUES ($1, $2, $3) RETURNING id",
    [provider, apiKey, `${provider}-${Date.now()}`]
  );
  const keyId = result.rows[0].id;
  console.log(`Added API key ID: ${keyId} (provider: ${provider})`);

  // Link to cohorts
  for (const cohortId of cohortIds) {
    await client.query(
      "INSERT INTO cohort_key_pools (cohort_id, api_key_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
      [parseInt(cohortId, 10), keyId]
    );
    console.log(`  Linked to cohort ID: ${cohortId}`);
  }

  await client.end();
  console.log("\nDone. Key is now available via assign_api_key().");
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
