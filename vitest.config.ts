import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    env: {
      VITEST: 'true',
      SUPABASE_URL: 'https://nupkmwtsrfpzkouhjbxz.supabase.co',
      SUPABASE_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im51cGttd3RzcmZwemtvdWhqYnh6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Mzg5NjQyMjQsImV4cCI6MjA1NDU0MDIyNH0.Q0RUJd78tq7_fes4xINzGVe32X_QyYqs-nWNnieETJU'
    },
    setupFiles: ['./src/tests/setupTests.ts'],
    coverage: {
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'dist/',
        '.eslintrc.js',
        'vitest.config.ts',
      ],
    },
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
    },
  },
});