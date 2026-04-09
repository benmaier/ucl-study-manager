import "dotenv/config";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { join, resolve } from "path";
import { randomBytes } from "crypto";
import pg from "pg";

const SQL_FILE = resolve("sql/setup.sql");
const CREDENTIALS_FILE = resolve("researcher-credentials.txt");

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("Error: DATABASE_URL not set in .env");
    process.exit(1);
  }

  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  // 1. Run setup.sql (key pool tables + grants)
  console.log("Running sql/setup.sql...");
  const sql = readFileSync(SQL_FILE, "utf-8");
  await client.query(sql);
  console.log("  Key pool tables and functions created.");

  // 2. Create or update researcher role with random password
  const password = randomBytes(16).toString("hex") + "!Rr1"; // Neon requires mixed case + special char
  const exists = await client.query("SELECT 1 FROM pg_roles WHERE rolname = 'researcher'");

  if (exists.rows.length === 0) {
    await client.query(`CREATE ROLE researcher WITH LOGIN PASSWORD '${password}'`);
    console.log("  Created researcher role.");
  } else {
    await client.query(`ALTER ROLE researcher WITH PASSWORD '${password}'`);
    console.log("  Updated researcher role password.");
  }

  // Grant permissions (idempotent)
  await client.query("GRANT USAGE ON SCHEMA public TO researcher");
  await client.query("GRANT SELECT ON ALL TABLES IN SCHEMA public TO researcher");
  await client.query("ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO researcher");
  console.log("  Granted SELECT on all tables.");

  // 3. Build researcher connection string
  const adminUrl = new URL(process.env.DATABASE_URL);
  const researcherUrl = `postgresql://researcher:${password}@${adminUrl.host}${adminUrl.pathname}?sslmode=require`;

  // 4. Save to file
  writeFileSync(
    CREDENTIALS_FILE,
    [
      "# Read-only database credentials for researchers",
      "# Use this connection string with Prisma Studio to browse study data.",
      "#",
      "# Usage:",
      "#   1. Put the DATABASE_URL below in your .env file",
      "#   2. Run: npx prisma studio",
      "#   3. Browse at http://localhost:5555",
      "#",
      "# This credential can only SELECT — it cannot modify any data.",
      "",
      `DATABASE_URL=${researcherUrl}`,
      "",
    ].join("\n"),
  );

  console.log(`\n  Researcher credentials saved to: ${CREDENTIALS_FILE}`);
  console.log("  Share this file with researchers who need database access.\n");

  await client.end();
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
