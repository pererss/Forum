import { defineConfig, devices } from '@playwright/test';

// E2E-проверка интерфейса. Перед запуском:
//   npm run dev
//   npx playwright install chromium
//   npm run test:e2e
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: [['list']],
  use: {
    baseURL: process.env.E2E_BASE ?? 'http://localhost:4000',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    locale: 'ru-RU',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
