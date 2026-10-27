import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: {
    alias: { '@': path.resolve(import.meta.dirname) },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    fileParallelism: false,
    testTimeout: 45_000,
    hookTimeout: 90_000,
    env: {
      NODE_ENV: 'test',
      // Тесты работают только в отдельной схеме, не в public.
      DATABASE_SCHEMA: 'nuffy_test',
      RATE_LIMIT_SCALE: '100',
      ENABLE_DEV_LOGIN: 'true',
      SESSION_TTL_DAYS: '1',
      ADMIN_EMAILS: 'admin@test.local',
    },
  },
});
