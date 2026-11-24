import { defineConfig } from '@playwright/test';

const PORT = 5333;
export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${PORT}`,
    // Uses the locally installed Microsoft Edge; no browser download required.
    channel: process.env.PW_CHANNEL ?? 'msedge',
    viewport: { width: 1366, height: 768 },
    locale: 'ar-SA',
    trace: 'off',
  },
  webServer: {
    command: 'npm run build && node --import tsx server/index.ts --dist',
    url: `http://localhost:${PORT}/api/health`,
    env: { PORT: String(PORT), HOST: '127.0.0.1', SERVE_DIST: '1' },
    timeout: 180_000,
    reuseExistingServer: false,
  },
});
