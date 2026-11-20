import { defineConfig } from "@playwright/test";

// End-to-end checks against the real app and database. Uses the installed
// Google Chrome, so no Playwright browser download is needed.
export default defineConfig({
  testDir: "e2e",
  timeout: 180_000,
  // Tests share one database; run them one at a time.
  workers: 1,
  use: {
    baseURL: "http://localhost:3000",
    channel: "chrome",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000/login",
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
