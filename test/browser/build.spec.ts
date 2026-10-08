import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
test('the Phase 0 webview entry loads in Chromium', async ({ page }) => {
  await page.setContent('<main id="editor"></main>');
  const errors: Error[] = [];
  page.on('pageerror', error => errors.push(error));
  await page.addScriptTag({ type: 'module', content: readFileSync('dist/webview/editor.js', 'utf8') });
  await expect(page.locator('#editor')).toBeVisible({ visible: false });
  expect(errors).toEqual([]);
});
