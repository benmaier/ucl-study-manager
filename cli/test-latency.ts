import "dotenv/config";
import pg from "pg";

async function main() {
  const start = Date.now();
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  console.log(`Connected in ${Date.now() - start}ms`);
  await client.end();
}

main().catch(e => console.error("Failed:", e.message));
