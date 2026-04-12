import { defineConfig } from "@playwright/test";

export default defineConfig({
  globalSetup: "./e2e/global-setup.ts",
  testDir: "./e2e",
  // Per-test timeout is set in the spec file via test.setTimeout()
  expect: {
    timeout: 30_000,
  },
  use: {
    baseURL: process.env.BASE_URL || "https://ucl-study-manager.vercel.app",
    headless: true,
  },
});
