import "dotenv/config";
import { readFileSync } from "fs";
import pg from "pg";

const sqlFile = process.argv[2];
if (!sqlFile) {
  console.error("Usage: npx tsx cli/run-sql.ts <path-to-sql-file>");
  process.exit(1);
}

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });

async function main() {
  await client.connect();
  const sql = readFileSync(sqlFile, "utf-8");
  await client.query(sql);
  console.log(`Executed ${sqlFile} successfully.`);
  await client.end();
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
