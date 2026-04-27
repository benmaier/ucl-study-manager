/**
 * E2E test for the admin panel's participant CSV upload.
 *
 * Logs into /admin, uploads an in-memory CSV creating a handful of test
 * participants against an existing study/cohort, asserts the UI's summary,
 * verifies the rows landed in the DB via Prisma, and then deletes them so
 * we don't leave dangling test users behind.
 *
 * Run:
 *   ADMIN_PASSWORD=... npx playwright test admin-csv-upload
 */

import "dotenv/config";
import { test, expect, type Page } from "@playwright/test";
import { prisma } from "../src/lib/prisma";

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
if (!ADMIN_PASSWORD) {
  throw new Error("Set ADMIN_PASSWORD env var for this test");
}

// Use chatbot_test / all_providers — the minimal test study.
const TEST_STUDY_ID = "chatbot_test";
const TEST_COHORT_ID = "all_providers";

// Per-run unique prefix so concurrent runs don't collide and cleanup is exact.
const RUN_ID = `csv-upload-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
const TEST_USERS = [
  { user: `${RUN_ID}-alpha`, password: "alpha-one-two-three-four-five" },
  { user: `${RUN_ID}-bravo`, password: "bravo-six-seven-eight-nine-ten" },
  { user: `${RUN_ID}-charlie`, password: "charlie-eleven-twelve-thirteen" },
];

test.setTimeout(60_000);

async function adminLogin(page: Page) {
  await page.goto("/admin");
  await page.locator("input[type=password]").fill(ADMIN_PASSWORD!);
  await page.locator("button[type=submit]").click();
  // Wait until we leave the login screen — the CSV upload section heading
  // only renders once authed.
  await page.getByText("Upload Participants CSV").waitFor({ timeout: 10_000 });
}

async function cleanupTestUsers() {
  const identifiers = TEST_USERS.map((u) => u.user);
  await prisma.participant.deleteMany({
    where: { identifier: { in: identifiers } },
  });
}

test.describe("Admin CSV upload", () => {
  test.afterAll(async () => {
    await cleanupTestUsers();
    await prisma.$disconnect();
  });

  test("creates participants from CSV and they appear in the DB", async ({ page }) => {
    await adminLogin(page);

    // Build the CSV in memory.
    const csvText = [
      "user,password,study_id,cohort_id",
      ...TEST_USERS.map(
        (u) => `${u.user},${u.password},${TEST_STUDY_ID},${TEST_COHORT_ID}`
      ),
    ].join("\n");

    // Set the hidden file input directly — avoids mucking with the drop zone.
    const fileInput = page.locator("#csv-file-input");
    await fileInput.setInputFiles({
      name: "participants.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(csvText, "utf-8"),
    });

    // Validation runs server-side → validated state shows the action button.
    const confirmButton = page.getByRole("button", {
      name: "Create / Update Participants",
    });
    await expect(confirmButton).toBeVisible({ timeout: 15_000 });

    // Also assert the row count summary lines up with what we sent.
    await expect(
      page.getByText(`${TEST_USERS.length} rows from participants.csv`)
    ).toBeVisible();

    // Kick the upload.
    await confirmButton.click();

    // "Done" state shows a green result paragraph like "3 created".
    const resultLine = page.locator("p.text-green-700").first();
    await expect(resultLine).toBeVisible({ timeout: 15_000 });
    const text = (await resultLine.textContent()) ?? "";
    expect(text).toContain(`${TEST_USERS.length} created`);

    // Verify in the DB.
    const rows = await prisma.participant.findMany({
      where: { identifier: { in: TEST_USERS.map((u) => u.user) } },
      include: { cohort: { include: { study: true } } },
    });
    expect(rows.length).toBe(TEST_USERS.length);
    for (const row of rows) {
      expect(row.cohort.cohortId).toBe(TEST_COHORT_ID);
      expect(row.cohort.study.studyId).toBe(TEST_STUDY_ID);
      expect(row.isTestUser).toBe(false);
      // Password should be hashed, not stored plaintext.
      expect(row.dbPassword).toBeTruthy();
      expect(row.dbPassword).not.toContain("alpha-one");
      expect(row.dbPassword!.length).toBeGreaterThan(30);
    }
  });
});
