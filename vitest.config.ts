import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'cli',
          include: ['tests/**/*.test.ts'],
          globalSetup: ['tests/global-setup.ts'],
          testTimeout: 20_000,
        },
      },
      {
        plugins: [react()],
        test: {
          name: 'dashboard',
          include: ['dashboard/tests/**/*.test.{ts,tsx}'],
          environment: 'jsdom',
          setupFiles: ['dashboard/tests/setup.ts'],
          testTimeout: 20_000,
        },
      },
    ],
  },
});
