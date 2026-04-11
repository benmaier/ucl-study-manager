/**
 * Runs once before the entire test suite.
 * Resets the test user completely and ensures stage 1 is started.
 */

const BASE_URL = process.env.BASE_URL || "https://ucl-study-manager.vercel.app";
const TEST_USER = process.env.TEST_USER;
const TEST_PASS = process.env.TEST_PASS;

export default async function globalSetup() {
  if (!TEST_USER || !TEST_PASS) {
    throw new Error("Set TEST_USER and TEST_PASS env vars");
  }

  console.log(`[setup] Resetting ${TEST_USER} on ${BASE_URL}`);

  // Login
  const loginRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identifier: TEST_USER, password: TEST_PASS }),
  });
  if (!loginRes.ok) throw new Error(`Login failed: ${loginRes.status}`);
  const cookies = (loginRes.headers.getSetCookie?.() || []).map((c) => c.split(";")[0]).join("; ");

  // Parse login data to get stage IDs
  const loginText = await loginRes.text();
  // Extract first stage ID with regex (avoids JSON parse issues with markdown content)
  const stageIdMatch = loginText.match(/"stages":\[{"id":(\d+)/);
  const firstStageId = stageIdMatch ? parseInt(stageIdMatch[1], 10) : null;
  if (!firstStageId) throw new Error("Could not find first stage ID in login response");

  // Reset all data
  const resetRes = await fetch(`${BASE_URL}/api/participant/reset`, {
    method: "POST",
    headers: { Cookie: cookies },
  });
  if (!resetRes.ok) throw new Error(`Reset failed: ${resetRes.status}`);
  console.log("[setup] Reset complete");

  // Start stage 1
  const startRes = await fetch(`${BASE_URL}/api/participant/progress`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookies },
    body: JSON.stringify({ action: "start", stageId: firstStageId }),
  });
  if (!startRes.ok) throw new Error(`Start stage failed: ${startRes.status}`);
  console.log(`[setup] Started stage ${firstStageId}`);

  // Verify chat is available
  const statusRes = await fetch(`${BASE_URL}/api/chat/status`, { headers: { Cookie: cookies } });
  const status = await statusRes.json();
  if (!status.available) throw new Error(`Chat not available after setup: ${JSON.stringify(status)}`);
  console.log(`[setup] Chat available on stage ${status.stageId}`);
}
