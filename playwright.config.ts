import { defineConfig } from "@playwright/test";

const isCI = process.env.CI === "true";

export default defineConfig({
  testDir: "./tests",
  testMatch: ["**/*.spec.ts"],
  outputDir: "./playwright-artifacts",
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  // CI jobs write blob reports that a later job merges into one HTML report and publishes to GitHub Pages.
  // BLOB_NAME keeps the two jobs' files apart; locally the HTML report is written directly.
  reporter: isCI
    ? [["blob", { fileName: `report-${process.env.BLOB_NAME ?? "run"}.zip` }], ["list"]]
    : [["html", { open: "never" }], ["list"]],

  timeout: 60_000,
  expect: {
    timeout: 10_000,
  },

  use: {
    screenshot: "only-on-failure",
    // Electron windows are traced by the electronApp fixture; the runner's own option does not cover them.
    trace: "off",
  },

  projects: [
    {
      // Renderer and main-process tests: every test owns an app instance and is driven only through
      // Playwright, without the mouse or window focus, so they run fully in parallel.
      name: "electron",
      testDir: "./tests/electron",
      fullyParallel: true,
    },
    {
      // Tests that drive real native UI through UI Automation. There is one desktop, one foreground
      // window and one mouse per machine, so these run one at a time; scale them with more machines.
      // Run this project on its own (npm run test:desktop): app windows opened by parallel "electron"
      // workers would cover the native dialogs under test.
      name: "desktop",
      testDir: "./tests",
      // Anchored to the suite's own folders, so a parent directory named "electron" changes nothing.
      testMatch: /[\\/]tests[\\/](hybrid|native)[\\/].*\.spec\.ts$/,
      workers: 1,
    },
  ],
});
