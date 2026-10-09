import { copyFileSync, existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { Page } from '@playwright/test';
import { paths } from './state';
import {
  agentChatInput,
  command,
  contextMenu,
  drag,
  editorTitleAction,
  expect,
  fitPage,
  openFile,
  pageAtTop,
  pagePoint,
  pdfViewer,
  pointAtTop,
  selectText,
  showPage,
  statusBarEntry,
  test,
  withoutSpaces,
} from './workbench';

// The exact text Copy Link for Agent produces is covered by test/unit/agent-text.test.ts,
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
  await expect(statusBarEntry(page, /^Page 1 \/ 12$/u)).toBeVisible();

  const outline = await outlineView(page);
  for (const title of ['Part One', 'Section 1.1', 'Section 1.2', 'Part Two']) {
    await expect(outline.getByRole('treeitem', { name: new RegExp(title) })).toBeVisible();
  }
  await outline.getByRole('treeitem', { name: /Section 1\.2/ }).click();
  await expect.poll(() => pageAtTop(viewer, 3)).toBe(true);
  // "Section 2.1" points 130 points down page 9 (test/fixtures/make-fixtures.mjs).
  await outline.getByRole('treeitem', { name: /Section 2\.1/ }).click();
  await expect.poll(() => pointAtTop(viewer, 9, 130)).toBe(true);

  const header = page.locator('.pane-header', { hasText: 'PDF Outline' });
  await openFile(page, 'notes.md');
  await expect(header).toHaveCount(0);
  await page.locator('.tabs-container .tab', { hasText: 'outline.pdf' }).click();
  await expect(header).toBeVisible();
});

test('Copy Link for Agent works from the selection menu and the editor title button, and Copy for Agent is gone', async ({ workbench: page }) => {
  await openFile(page, PDF);
  const viewer = await pdfViewer(page);
  await fitPage(page, viewer);
  await showPage(page, viewer, 3);

  const at = await pagePoint(viewer, 3);
  await selectText(page, viewer, at(74, TEXT_MIDLINE), at(205, TEXT_MIDLINE));
  const textMenu = viewer.getByRole('toolbar', { name: 'PDF text selection actions' });
  await expect(textMenu.getByRole('button')).toHaveText(['Copy Link for Agent', 'Copy text']);
  await textMenu.getByRole('button', { name: 'Copy Link for Agent' }).click();
  await expect.poll(() => agentChatInput(page), { timeout: 15_000 })
    .toContain(withoutSpaces(`Source: [${PDF} (page 3)](<${PDF}#page=3&viewrect=`));

  await drag(page, at(150, 150), at(250, 250));
  await expect(viewer.getByRole('toolbar', { name: 'PDF region actions' })).toBeVisible();
  await expect(page.locator('.editor-actions').getByRole('button', { name: /^(Copy for Agent|Ask Agent)/u })).toHaveCount(0);
  await editorTitleAction(page, 'Copy Link for Agent');
  await expect.poll(() => agentChatInput(page), { timeout: 15_000 })
    .toContain(withoutSpaces(`Source: [${PDF} (page 3 region)](<${PDF}#page=3&viewrect=150,150,100,100>)`));

  await page.keyboard.press('F1');
  await page.locator('.quick-input-widget input:visible').fill('>PDF: Copy for Agent');
  await expect(page.locator('.quick-input-list .monaco-list-row', { hasText: 'Copy for Agent' })).toHaveCount(0);
  await page.locator('.quick-input-widget input:visible').fill('>PDF: Ask Agent');
  await expect(page.locator('.quick-input-list .monaco-list-row', { hasText: 'Ask Agent' })).toHaveCount(0);
  await page.keyboard.press('Escape');
});

test('Copy Link for Agent from the context menu opens the agent chat with the region typed in and its snapshot attached', async ({ workbench: page }) => {
  // VS Code's chat counts as served thanks to test/fixtures/chat-participant; Cursor has its own.
  await openFile(page, PDF);
  const viewer = await pdfViewer(page);
  await fitPage(page, viewer);
  await showPage(page, viewer, 3);
  const at = await pagePoint(viewer, 3);
  await drag(page, at(60, 70), at(230, 150));
  await expect(viewer.getByRole('toolbar', { name: 'PDF region actions' })).toBeVisible();
  await contextMenu(page, at(100, TEXT_MIDLINE), 'Copy Link for Agent');
  await expect.poll(() => agentChatInput(page), { timeout: 15_000 })
    .toContain(withoutSpaces(`Source: [${PDF} (page 3 region)](<${PDF}#page=3&viewrect=60,70,170,80>)`));
  // The snapshot: attached in VS Code's chat, a file pill in Cursor's.
  expect(await agentChatInput(page)).toMatch(/outline-p3-[0-9a-f]{12}\.png/u);
});

test('PDF: Open Location opens a pasted link at its page and flashes its box', async ({ workbench: page }) => {
  await command(page, 'PDF: Open Location…');
  const input = page.locator('.quick-input-widget input:visible');
  // The source line exactly as Copy Link for Agent writes it.
  await input.fill(`Source: [${PDF} (page 5)](<${PDF}#page=5&viewrect=72,83,134,21>)`);
  await input.press('Enter');
  const viewer = await pdfViewer(page);
  await expect(viewer.locator('.page[data-page-index="4"] .location-highlight')).toBeVisible();
  await expect(statusBarEntry(page, /^Page 5 \/ 12$/u)).toBeVisible();
});

test('the viewer reloads when the PDF changes on disk', async ({ workbench: page }) => {
  const changing = path.join(paths.workspace, 'docs', 'changing.pdf');
  copyFileSync(path.join(paths.fixtures, 'outline.pdf'), changing);
  await openFile(page, 'docs/changing.pdf');
  await pdfViewer(page);
  await expect(statusBarEntry(page, /^Page 1 \/ 12$/u)).toBeVisible();
  const outline = await outlineView(page);
  await expect(outline.getByRole('treeitem', { name: /Part One/ })).toBeVisible();

  copyFileSync(path.join(paths.fixtures, 'short.pdf'), changing);
  await expect(statusBarEntry(page, /^Page 1 \/ 3$/u)).toBeVisible();
  await expect(outline.getByText('This PDF has no outline.')).toBeVisible();
});

test('the agent bridge is off by default, and its setting starts and stops it', async ({ workbench: page }) => {
  // The bridge starts a local MCP server, so it is opt-in (vscodeEmbedPdf.agentBridge.enabled).
  // A running bridge announces itself with a file in ~/.agent-pdf-viewer/bridges.
  const bridges = path.join(paths.home, '.agent-pdf-viewer', 'bridges');
  const announced = (): number => existsSync(bridges) ? readdirSync(bridges).filter(name => name.endsWith('.json')).length : 0;
  await openFile(page, PDF);
  await pdfViewer(page);
  expect(announced()).toBe(0);

  // Copy MCP Setup offers to turn it on.
  await command(page, 'PDF: Copy MCP Setup for Claude Code / Codex…');
  const offer = page.locator('.notification-toast').filter({ hasText: 'The agent bridge is off.' });
  await expect(offer).toBeVisible();
  await offer.getByRole('button', { name: 'Turn On' }).click();
  await expect.poll(announced, { timeout: 15_000 }).toBe(1);
  await expect(page.locator('.quick-input-widget')).toBeVisible();
  await page.keyboard.press('Escape');

  // Turning the setting off stops the server, without a reload.
  const settingsFile = path.join(paths.userData, 'User', 'settings.json');
  const settings = JSON.parse(readFileSync(settingsFile, 'utf8')) as Record<string, unknown>;
  expect(settings['vscodeEmbedPdf.agentBridge.enabled']).toBe(true);
  writeFileSync(settingsFile, JSON.stringify({ ...settings, 'vscodeEmbedPdf.agentBridge.enabled': false }, null, 2));
  await expect.poll(announced, { timeout: 15_000 }).toBe(0);
});
