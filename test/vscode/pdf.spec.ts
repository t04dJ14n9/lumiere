import { createHash } from 'node:crypto';
import { copyFileSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type { Page } from '@playwright/test';
import { paths } from './state';
import {
  command,
  drag,
  expect,
  fitPage,
  modifier,
  openFile,
  pageAtTop,
  pagePoint,
  pdfViewer,
  readClipboard,
  selectText,
  showPage,
  test,
  writeClipboard,
} from './workbench';

const PDF = 'docs/outline.pdf';
const TEXT_MIDLINE = 94;

function sha256(relativePath: string): string {
  return createHash('sha256').update(readFileSync(path.join(paths.workspace, relativePath))).digest('hex');
}

/** Click a Copy for Agent control and return what landed on the clipboard. */
async function copiedBy(page: Page, click: () => Promise<void>): Promise<string> {
  const before = `clipboard before the test ${Date.now()}`;
  writeClipboard(before);
  await click();
  await expect(page.getByText('Selection copied for agent.').first()).toBeVisible();
  await expect.poll(readClipboard).not.toBe(before);
  return readClipboard();
}

/** The "PDF Outline" view in the Explorer, expanded. */
async function outlineView(page: Page) {
  await command(page, 'View: Show Explorer');
  const header = page.locator('.pane-header', { hasText: 'PDF Outline' });
  await expect(header).toBeVisible();
  if ((await header.getAttribute('aria-expanded')) === 'false') await header.click();
  return page.locator('.pane', { has: header });
}

test('a PDF opens in the viewer and its outline is shown in the Explorer', async ({ workbench: page }) => {
  await openFile(page, PDF);
  const viewer = await pdfViewer(page);
  await expect(viewer.getByRole('textbox', { name: 'Page' })).toHaveValue('1');
  await expect(viewer.getByRole('toolbar', { name: 'PDF toolbar' })).toContainText('of 12');

  const outline = await outlineView(page);
  for (const title of ['Part One', 'Section 1.1', 'Section 1.2', 'Part Two']) {
    await expect(outline.getByRole('treeitem', { name: new RegExp(title) })).toBeVisible();
  }
  await outline.getByRole('treeitem', { name: /Part Two/ }).click();
  await expect.poll(() => pageAtTop(viewer, 6)).toBe(true);
  await outline.getByRole('treeitem', { name: /Section 1\.2/ }).click();
  await expect.poll(() => pageAtTop(viewer, 3)).toBe(true);
});

test('Copy for Agent copies a text selection with its page, box, file hash and text', async ({ workbench: page }) => {
  await openFile(page, PDF);
  const viewer = await pdfViewer(page);
  await fitPage(viewer);
  await showPage(viewer, 3);
  const at = await pagePoint(viewer, 3);
  await selectText(page, viewer, at(74, TEXT_MIDLINE), at(205, TEXT_MIDLINE));
  const menu = viewer.getByRole('toolbar', { name: 'PDF text selection actions' });

  const copied = await copiedBy(page, () => menu.getByRole('button', { name: 'Copy for Agent' }).click());
  const [source, hash, blank, heading, text] = copied.split('\n');
  expect(source).toMatch(/^Source: \[docs\/outline\.pdf \(page 3\)\]\(<docs\/outline\.pdf#page=3&viewrect=[\d.]+,[\d.]+,[\d.]+,[\d.]+>\)$/);
  expect(hash).toBe(`PDF source SHA-256: \`${sha256(PDF)}\``);
  expect([blank, heading, text]).toEqual(['', 'Selected text:', 'Synthetic page 3']);
  const [left, top, width, height] = /viewrect=([^>]+)>/.exec(source!)![1]!.split(',').map(Number) as number[];
  expect(left).toBeGreaterThan(70);
  expect(left! + width!).toBeLessThan(210);
  expect(top).toBeGreaterThan(80);
  expect(top! + height!).toBeLessThan(108);
});

test('a region copied from the editor title button keeps the dragged box', async ({ workbench: page }) => {
  await openFile(page, PDF);
  const viewer = await pdfViewer(page);
  await fitPage(viewer);
  await showPage(viewer, 2);
  const at = await pagePoint(viewer, 2);
  await drag(page, at(150, 150), at(250, 250));
  await expect(viewer.getByRole('toolbar', { name: 'PDF region actions' })).toBeVisible();

  const titleButton = page.locator('.editor-actions').getByRole('button', { name: 'Copy for Agent' });
  const copied = await copiedBy(page, () => titleButton.click());
  expect(copied).toBe([
    'Source: [docs/outline.pdf (page 2 region)](<docs/outline.pdf#page=2&viewrect=150,150,100,100>)',
    `PDF source SHA-256: \`${sha256(PDF)}\``,
    '',
    'Selected PDF region. Read the text inside the view rectangle, or render that area of the page to inspect figures and tables.',
  ].join('\n'));
});

test('PDF: Open Location opens a pasted link at its page and flashes its box', async ({ workbench: page }) => {
  await command(page, 'PDF: Open Location…');
  const input = page.locator('.quick-input-widget input:visible');
  await input.fill(`${PDF}#page=5&viewrect=72,83,134,21`);
  await input.press('Enter');
  const viewer = await pdfViewer(page);
  await expect(viewer.locator('.page[data-page-index="4"] .location-highlight')).toBeVisible();
  await expect(viewer.getByRole('textbox', { name: 'Page' })).toHaveValue('5');
});

test('the outline view follows the active editor', async ({ workbench: page }) => {
  await openFile(page, PDF);
  await pdfViewer(page);
  const outline = await outlineView(page);
  await expect(outline.getByRole('treeitem', { name: /Part One/ })).toBeVisible();
  await openFile(page, 'notes.md');
  await expect(page.locator('.pane-header', { hasText: 'PDF Outline' })).toHaveCount(0);
  await page.locator('.tabs-container .tab', { hasText: 'outline.pdf' }).click();
  await expect(page.locator('.pane-header', { hasText: 'PDF Outline' })).toBeVisible();
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

test('Cmd/Ctrl+C copies the selected PDF text', async ({ workbench: page }) => {
  await openFile(page, PDF);
  const viewer = await pdfViewer(page);
  await fitPage(viewer);
  await showPage(viewer, 4);
  const at = await pagePoint(viewer, 4);
  await selectText(page, viewer, at(74, TEXT_MIDLINE), at(205, TEXT_MIDLINE));
  writeClipboard('before the copy');
  await page.keyboard.press(`${modifier}+C`);
  await expect.poll(readClipboard).toBe('Synthetic page 4');
});
