/**
 * Bulk participant generator for large pre-randomised pools.
 *
 * Same end result as cli/generate-participants.ts (creates rows in the
 * participants table), but designed for counts up to ~100k:
 *
 *   - Fans bcrypt hashing across all CPU cores via worker_threads.
 *     At cost=10 a single thread does ~50ms/hash, so 100k takes ~83min
 *     on one core; with 8-16 cores it's typically 5-15min.
 *   - Inserts via prisma.participant.createMany in batches, so even
 *     100k rows hit the DB as ~100 round-trips instead of 100k.
 *   - Writes plaintext credentials to a CSV file (default
 *     participants-<session>-<cohort>.csv in the cwd) so they can be
 *     handed out at the door. Plaintext is never logged.
 *   - Streams progress so you can see it's making forward motion.
 *
 * Usage:
 *   npx tsx cli/generate-participants-bulk.ts <session-id> \
 *     --count <N> --cohort <cohort-id> [--test] [--output path.csv] \
 *     [--cost <bcrypt-cost>]
 */
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { writeFileSync } from "node:fs";
import { Worker } from "node:worker_threads";
import { prisma } from "../src/lib/prisma.js";
import { generateCredentials } from "./lib/id-generator.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const WORKER_PATH = path.join(__dirname, "lib", "bcrypt-worker.ts");

// ─── arg parsing ──────────────────────────────────────────────────────
function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i === -1 ? undefined : process.argv[i + 1];
}

const sessionIdArg = process.argv[2];
const countStr = arg("--count");
const cohortIdArg = arg("--cohort");
const outputPath = arg("--output");
const costStr = arg("--cost");
const isTestUser = process.argv.includes("--test");

if (!sessionIdArg || !countStr || !cohortIdArg) {
  console.error(
    "Usage: npx tsx cli/generate-participants-bulk.ts <session-id> --count <N> --cohort <cohort-id> [--test] [--output path.csv] [--cost <bcrypt-cost>]",
  );
  process.exit(1);
}

const sessionId = parseInt(sessionIdArg, 10);
const count = parseInt(countStr, 10);
const bcryptCost = costStr ? parseInt(costStr, 10) : 10;

if (isNaN(sessionId) || isNaN(count) || !cohortIdArg) {
  console.error("Error: session-id and count must be numbers, cohort must be a string.");
  process.exit(1);
}
if (count < 1) {
  console.error("Error: --count must be at least 1");
  process.exit(1);
}
if (bcryptCost < 4 || bcryptCost > 14) {
  console.error("Error: --cost must be between 4 and 14");
  process.exit(1);
}

// ─── lookup session + cohort ──────────────────────────────────────────
const session = await prisma.studySession.findUnique({
  where: { id: sessionId },
  include: { study: true },
});
if (!session) {
  console.error(`Error: Session with ID ${sessionId} not found.`);
  process.exit(1);
}
const cohort = await prisma.cohort.findFirst({
  where: { studyId: session.studyId, cohortId: cohortIdArg },
});
if (!cohort) {
  const available = await prisma.cohort.findMany({
    where: { studyId: session.studyId },
    select: { cohortId: true },
  });
  console.error(
    `Error: Cohort "${cohortIdArg}" not found for study "${session.study.title}". Available: ${available.map((c) => c.cohortId).join(", ")}`,
  );
  process.exit(1);
}

// ─── generate unique identifiers ──────────────────────────────────────
console.log(`Loading existing participant identifiers…`);
const existingIds = await prisma.participant.findMany({
  select: { identifier: true },
});
const existingSet = new Set(existingIds.map((p) => p.identifier));
console.log(
  `Generating ${count.toLocaleString()} unique credentials (avoiding ${existingSet.size.toLocaleString()} existing)…`,
);
const credentials = generateCredentials(count, existingSet);

// ─── hash passwords in parallel via worker pool ───────────────────────
const numWorkers = Math.max(1, Math.min(os.cpus().length, count));
console.log(
  `Hashing ${count.toLocaleString()} passwords across ${numWorkers} worker(s) at bcrypt cost=${bcryptCost}…`,
);
const t0 = Date.now();

// Split credentials into approximately equal chunks per worker.
const chunkSize = Math.ceil(count / numWorkers);
const slices: { username: string; password: string }[][] = [];
for (let i = 0; i < count; i += chunkSize) {
  slices.push(credentials.slice(i, i + chunkSize));
}

const hashedSlices = await Promise.all(
  slices.map(
    (slice, idx) =>
      new Promise<string[]>((resolve, reject) => {
        const worker = new Worker(WORKER_PATH);
        worker.once("message", (msg: { hashes: string[] }) => {
          resolve(msg.hashes);
          worker.terminate();
        });
        worker.once("error", reject);
        worker.once("exit", (code) => {
          if (code !== 0) reject(new Error(`Worker ${idx} exited with ${code}`));
        });
        worker.postMessage({
          plaintexts: slice.map((c) => c.password),
          cost: bcryptCost,
        });
      }),
  ),
);
const hashes = hashedSlices.flat();
const hashSeconds = (Date.now() - t0) / 1000;
console.log(`Hashed in ${hashSeconds.toFixed(1)}s (${(hashes.length / hashSeconds).toFixed(0)} hashes/s)`);

// ─── bulk insert in batches ───────────────────────────────────────────
const INSERT_BATCH = 1_000;
console.log(`Inserting ${count.toLocaleString()} participants in batches of ${INSERT_BATCH.toLocaleString()}…`);
const tIns = Date.now();
for (let i = 0; i < credentials.length; i += INSERT_BATCH) {
  const batch = credentials
    .slice(i, i + INSERT_BATCH)
    .map((cred, j) => ({
      identifier: cred.username,
      dbUser: cred.username.replace(/-/g, "_"),
      dbPassword: hashes[i + j],
      isTestUser,
      sessionId,
      cohortId: cohort.id,
    }));
  await prisma.participant.createMany({ data: batch });
  process.stdout.write(
    `\r  ${Math.min(i + INSERT_BATCH, credentials.length).toLocaleString()}/${credentials.length.toLocaleString()} inserted`,
  );
}
process.stdout.write("\n");
console.log(`Inserts done in ${((Date.now() - tIns) / 1000).toFixed(1)}s`);

// ─── write credentials CSV ────────────────────────────────────────────
const csvPath = path.resolve(
  outputPath ?? `participants-${sessionId}-${cohortIdArg}.csv`,
);
const csv = [
  "username,password",
  ...credentials.map((c) => `${c.username},${c.password}`),
].join("\n");
writeFileSync(csvPath, csv + "\n");
console.log(`Wrote ${credentials.length.toLocaleString()} credentials to ${csvPath}`);

await prisma.$disconnect();
