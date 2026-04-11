import { defineConfig } from "@playwright/test";

export default defineConfig({
  globalSetup: "./e2e/global-setup.ts",
  testDir: "./e2e",
  timeout: 120_000,
  expect: {
    timeout: 60_000,
  },
  use: {
    baseURL: process.env.BASE_URL || "https://ucl-study-manager.vercel.app",
    headless: true,
  },
});
