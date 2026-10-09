import { copyFileSync } from 'node:fs';
import path from 'node:path';
import type { Page } from '@playwright/test';
import { paths } from './state';
import {
  command,
  drag,
  expect,
  fitPage,
  openFile,
  pageAtTop,
  pagePoint,
  pdfViewer,
  selectText,
  showPage,
  test,
} from './workbench';

// The exact text Copy for Agent produces is covered by test/unit/agent-text.test.ts,
// and the selection geometry by the browser tests. These tests check the parts
// only a real VS Code has: the editor, the Explorer view, commands and buttons.

const PDF = 'docs/outline.pdf';
const TEXT_MIDLINE = 94;

/** The "PDF Outline" view in the Explorer, expanded. */
async function outlineView(page: Page) {
  await command(page, 'View: Show Explorer');
  const header = page.locator('.pane-header', { hasText: 'PDF Outline' });
  await expect(header).toBeVisible();
  if ((await header.getAttribute('aria-expanded')) === 'false') await header.click();
  return page.locator('.pane', { has: header });
}

test('a PDF opens with its outline in the Explorer, shown only while the PDF is active', async ({ workbench: page }) => {
  await openFile(page, PDF);
  const viewer = await pdfViewer(page);
  await expect(viewer.getByRole('toolbar', { name: 'PDF toolbar' })).toContainText('of 12');

  const outline = await outlineView(page);
  for (const title of ['Part One', 'Section 1.1', 'Section 1.2', 'Part Two']) {
    await expect(outline.getByRole('treeitem', { name: new RegExp(title) })).toBeVisible();
  }
  await outline.getByRole('treeitem', { name: /Section 1\.2/ }).click();
  await expect.poll(() => pageAtTop(viewer, 3)).toBe(true);

  const header = page.locator('.pane-header', { hasText: 'PDF Outline' });
  await openFile(page, 'notes.md');
  await expect(header).toHaveCount(0);
  await page.locator('.tabs-container .tab', { hasText: 'outline.pdf' }).click();
  await expect(header).toBeVisible();
});

test('Copy for Agent works from the selection menu and the editor title button', async ({ workbench: page }) => {
  await openFile(page, PDF);
  const viewer = await pdfViewer(page);
  await fitPage(viewer);
  await showPage(viewer, 3);
  // Exact text: VS Code repeats notifications in a screen-reader alert ("Info: …").
  const confirmation = page.getByText('Selection copied for agent.', { exact: true });

  const at = await pagePoint(viewer, 3);
  await selectText(page, viewer, at(74, TEXT_MIDLINE), at(205, TEXT_MIDLINE));
  await viewer.getByRole('toolbar', { name: 'PDF text selection actions' })
    .getByRole('button', { name: 'Copy for Agent' }).click();
  await expect(confirmation).toBeVisible();
  await command(page, 'Notifications: Clear All Notifications');
  await expect(confirmation).toHaveCount(0);

  await drag(page, at(150, 150), at(250, 250));
  await expect(viewer.getByRole('toolbar', { name: 'PDF region actions' })).toBeVisible();
  await page.locator('.editor-actions').getByRole('button', { name: 'Copy for Agent' }).click();
  await expect(confirmation).toBeVisible();
});

test('PDF: Open Location opens a pasted link at its page and flashes its box', async ({ workbench: page }) => {
  await command(page, 'PDF: Open Location…');
  const input = page.locator('.quick-input-widget input:visible');
  // The source line exactly as Copy for Agent writes it.
  await input.fill(`Source: [${PDF} (page 5)](<${PDF}#page=5&viewrect=72,83,134,21>)`);
  await input.press('Enter');
  const viewer = await pdfViewer(page);
  await expect(viewer.locator('.page[data-page-index="4"] .location-highlight')).toBeVisible();
  await expect(viewer.getByRole('textbox', { name: 'Page' })).toHaveValue('5');
});

test('the viewer reloads when the PDF changes on disk', async ({ workbench: page }) => {
  const changing = path.join(paths.workspace, 'docs', 'changing.pdf');
  copyFileSync(path.join(paths.fixtures, 'outline.pdf'), changing);
  await openFile(page, 'docs/changing.pdf');
  const viewer = await pdfViewer(page);
  await expect(viewer.getByRole('toolbar', { name: 'PDF toolbar' })).toContainText('of 12');
  const outline = await outlineView(page);
  await expect(outline.getByRole('treeitem', { name: /Part One/ })).toBeVisible();

  copyFileSync(path.join(paths.fixtures, 'short.pdf'), changing);
  await expect(viewer.getByRole('toolbar', { name: 'PDF toolbar' })).toContainText('of 3');
  await expect(outline.getByText('This PDF has no outline.')).toBeVisible();
});
