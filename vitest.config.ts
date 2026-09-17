import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    include: ['tests/unit/**/*.test.ts'],
    // Each DB-backed test file boots its own in-memory PGlite; keep them
    // serial so they don't fight over the CPU on a 4-core box.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
  resolve: { alias: { '@': path.resolve(import.meta.dirname, 'src') } },
});
