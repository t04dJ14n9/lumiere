import { defineConfig } from '@playwright/test';
// No native behaviour exists in Phase 0. The isolated harness arrives in Phase 3.
export default defineConfig({ testDir: '.', testMatch: '*.spec.ts', workers: 1, reporter: 'list' });
