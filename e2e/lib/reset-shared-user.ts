/**
 * Resets the shared TEST_USER (smoke-lotus-eagle) and starts stage 1.
 *
 * Specs that share this user AND advance stages (study-flow, analysis-only)
 * must call this in beforeAll — global-setup runs once before the whole suite
 * but doesn't help when an earlier spec leaves the participant on "Thank you!".
 */

const BASE_URL = process.env.BASE_URL || "https://ucl-study-manager.vercel.app";
const TEST_USER = process.env.TEST_USER;
const TEST_PASS = process.env.TEST_PASS;

export async function resetSharedUser() {
  if (!TEST_USER || !TEST_PASS) {
    throw new Error("Set TEST_USER and TEST_PASS env vars");
  }

  const loginRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identifier: TEST_USER, password: TEST_PASS }),
  });
  if (!loginRes.ok) throw new Error(`Login failed: ${loginRes.status}`);
  const cookies = (loginRes.headers.getSetCookie?.() || []).map((c) => c.split(";")[0]).join("; ");

  const loginText = await loginRes.text();
  const stageIdMatch = loginText.match(/"stages":\[{"id":(\d+)/);
  const firstStageId = stageIdMatch ? parseInt(stageIdMatch[1], 10) : null;
  if (!firstStageId) throw new Error("Could not find first stage ID in login response");

  const resetRes = await fetch(`${BASE_URL}/api/participant/reset`, {
    method: "POST",
    headers: { Cookie: cookies },
  });
  if (!resetRes.ok) throw new Error(`Reset failed: ${resetRes.status}`);

  const startRes = await fetch(`${BASE_URL}/api/participant/progress`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookies },
    body: JSON.stringify({ action: "start", stageId: firstStageId }),
  });
  if (!startRes.ok) throw new Error(`Start stage failed: ${startRes.status}`);
}
