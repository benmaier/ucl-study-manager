import { defineConfig } from "@playwright/test";

export default defineConfig({
  globalSetup: "./e2e/global-setup.ts",
  testDir: "./e2e",
  // Single worker: study-flow tests share the smoke-lotus-eagle participant
  // and advance it through stages serially. Multiple workers race on that
  // shared state — `advance to Gemini` in worker B while worker A is still
  // mid-Anthropic-chat ends up advancing past the expected stage.
  workers: 1,
  // Per-test timeout is set in the spec file via test.setTimeout()
  expect: {
    timeout: 30_000,
  },
  use: {
    baseURL: process.env.BASE_URL || "https://ucl-study-manager.vercel.app",
    headless: true,
  },
});
