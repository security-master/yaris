import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './harness',
  timeout: 120_000,
  retries: 0,
  use: {
    baseURL: 'http://127.0.0.1:5173',
    viewport: { width: 1600, height: 900 },
    deviceScaleFactor: 2,
  },
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 5173',
    port: 5173,
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
