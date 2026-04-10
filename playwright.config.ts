import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 120_000, // LLM responses can be slow
  expect: {
    timeout: 60_000,
  },
  use: {
    baseURL: process.env.BASE_URL || "https://ucl-study-manager.vercel.app",
    headless: true,
  },
});
