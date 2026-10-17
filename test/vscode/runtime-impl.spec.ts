/**
 * Stage B host smoke: activation under the selected runtimeImpl, Reload Window
 * (deactivate + reactivate without hung host), and PDF Outline still works.
 * When PDF_WORKSHOP_RUNTIME_IMPL=cordis (or the setting), asserts the log line.
 * Extensions: Disable under --extensionDevelopmentPath is not used (no VSIX);
 * Reload Window is the mandated deactivate gate for this unpackaged path.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import type { Page } from '@playwright/test';
import { paths } from './state';
import {
  command,
  expect,
  openFile,
  pdfViewer,
  statusBarEntry,
  test,
} from './workbench';

const PDF = 'docs/outline.pdf';

function workshopLogText(): string {
  const found: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const full = path.join(dir, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (/PDF Workshop\.log$/u.test(entry)) found.push(full);
    }
  };
  try {
    walk(path.join(paths.userData, 'logs'));
  } catch {
    return '';
  }
  return found.map(file => readFileSync(file, 'utf8')).join('\n');
}

async function outlineVisible(page: Page): Promise<void> {
  await openFile(page, PDF);
  await pdfViewer(page);
  await expect(statusBarEntry(page, /^Page 1 \/ 12$/u)).toBeVisible();
  await command(page, 'View: Show Explorer');
  const header = page.locator('.pane-header', { hasText: 'PDF Outline' });
  await expect(header).toBeVisible();
}

test('runtimeImpl host: outline works, survives Reload Window, and logs the selected impl', async ({ workbench: page }) => {
  test.setTimeout(120_000);
  const expected = process.env.PDF_WORKSHOP_RUNTIME_IMPL?.trim().toLowerCase() === 'cordis'
    ? 'cordis'
    : 'native';

  await outlineVisible(page);
  await expect.poll(() => workshopLogText()).toMatch(new RegExp(`runtimeImpl=${expected}`));

  await command(page, 'Developer: Reload Window');
  // After reload the CDP session can briefly lose the workbench; reconnect via fixture is not automatic.
  // Wait for the workbench shell, then exercise the viewer again.
  await expect(page.locator('.monaco-workbench .part.editor')).toBeVisible({ timeout: 60_000 });
  await outlineVisible(page);
  await expect.poll(() => workshopLogText()).toMatch(new RegExp(`runtimeImpl=${expected}`));
});
