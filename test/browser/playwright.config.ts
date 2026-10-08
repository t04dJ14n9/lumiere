import { defineConfig } from '@playwright/test';
export default defineConfig({ testDir: '.', testMatch: '*.spec.ts', use: { headless: true }, workers: 2, reporter: 'list' });
