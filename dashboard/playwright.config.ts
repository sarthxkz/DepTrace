import { defineConfig } from '@playwright/test';

// End-to-end tests against the built CLI (npm run build first) and a real
// browser. They use the installed Chrome (PLAYWRIGHT_CHANNEL to change it), so
// no browser download is needed.
const port = 7398;

export default defineConfig({
  testDir: 'e2e',
  outputDir: '../test-results',
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: `http://127.0.0.1:${String(port)}`,
    channel: process.env.PLAYWRIGHT_CHANNEL ?? 'chrome',
  },
  webServer: {
    command: `node ../dist/index.js dashboard ../tests/fixtures/storefront --baseline ../tests/fixtures/storefront/deptrace-baseline.json --port ${String(port)}`,
    cwd: import.meta.dirname,
    url: `http://127.0.0.1:${String(port)}/`,
    reuseExistingServer: false,
    timeout: 60_000,
  },
  projects: [
    { name: 'desktop', use: { viewport: { width: 1440, height: 900 } }, grepInvert: /@phone/ },
    {
      name: 'phone',
      use: { viewport: { width: 390, height: 844 }, hasTouch: true },
      grep: /@phone/,
    },
  ],
});
