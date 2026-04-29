import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Only run our unit + integration suites. Without an explicit `include`
    // vitest picks up Playwright `e2e/*.spec.ts` files (which import
    // @playwright/test and crash under vitest) and any `*.test.ts`/`*.spec.ts`
    // files inside the sibling SDK / widget repos that live as untracked
    // sub-checkouts at the project root.
    include: ["tests/**/*.{test,spec}.?(c|m)[jt]s?(x)"],
  },
});
