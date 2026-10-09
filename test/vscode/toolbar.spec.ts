import type { Frame, Page } from '@playwright/test';
import {
  PAGE_STATUS,
  ZOOM_STATUS,
  command,
  drag,
  editorTitleAction,
  expect,
  openFile,
  pageAtTop,
  pagePoint,
  pdfViewer,
  quickInputTitled,
  showPage,
  statusBarEntry,
  test,
} from './workbench';

// The viewer's controls in the editor's own UI (the default `chrome` mode):
// editor title actions, status bar entries and keyboard shortcuts. What the
// viewer does with each action is covered by the browser tests.

const PDF = 'docs/outline.pdf';
/** Cursor keeps extension title actions in the "…" menu, so the status bar gets buttons too. */
const inCursor = /cursor/iu.test(process.env.VSCODE_EXECUTABLE ?? '');

function zoomStatus(page: Page) {
  return statusBarEntry(page, ZOOM_STATUS);
}

/** A status bar button of the viewer, by its id. */
function statusBarButton(page: Page, id: string) {
  return page.locator(`.part.statusbar [id$="vscodeEmbedPdf.${id}"]`);
}

function zoomPercent(label: string): number {
  return Number(/(\d+)%/u.exec(label)![1]);
}

/** Give the viewer the keyboard focus with a click on empty space of a page in view. */
async function focusViewer(page: Page, viewer: Frame, pageNumber: number): Promise<void> {
  const at = await pagePoint(viewer, pageNumber);
  await page.mouse.click(...at(20, 20).screen);
}

/** The tool the viewer is using, from its class. */
function tool(viewer: Frame): Promise<string> {
  return viewer.evaluate(() => document.querySelector('.viewer')!.classList.contains('tool-region') ? 'region' : 'text');
}

async function setToolbarMode(page: Page, label: RegExp): Promise<void> {
  await command(page, 'PDF: Choose Toolbar Location…');
  await expect(quickInputTitled(page, /^PDF Viewer Controls/u)).toBeVisible();
  await page.locator('.quick-input-list .monaco-list-row').filter({ hasText: label }).first().click();
}

test('the status bar shows the page and zoom, and opens a page or a zoom when clicked', async ({ workbench: page }) => {
  await openFile(page, PDF);
  const viewer = await pdfViewer(page);
  await expect(statusBarEntry(page, /^Page 1 \/ 12$/u)).toBeVisible();
  await expect(zoomStatus(page)).toHaveText(/^Fit Width \(\d+%\)$/u);
  // No viewer toolbar: the controls are in the editor's own UI.
  await expect(viewer.getByRole('toolbar', { name: 'PDF toolbar' })).toHaveCount(0);
  // Status bar buttons only where the title bar hides the actions.
  await expect(statusBarButton(page, 'nextPage')).toHaveCount(inCursor ? 1 : 0);

  await statusBarEntry(page, PAGE_STATUS).click();
  const input = quickInputTitled(page, /^Go to Page/u);
  await expect(input).toHaveValue('1');
  await input.fill('7');
  await input.press('Enter');
  await expect.poll(() => pageAtTop(viewer, 7)).toBe(true);
  await expect(statusBarEntry(page, /^Page 7 \/ 12$/u)).toBeVisible();

  await zoomStatus(page).click();
  const zoomInput = quickInputTitled(page, /^Zoom \(now /u);
  await zoomInput.fill('140');
  await expect(page.locator('.quick-input-list .monaco-list-row').first()).toContainText('140%');
  await zoomInput.press('Enter');
  await expect(zoomStatus(page)).toHaveText('140%');

  await zoomStatus(page).click();
  await expect(quickInputTitled(page, /^Zoom \(now 140%\)/u)).toBeVisible();
  await page.locator('.quick-input-list .monaco-list-row').filter({ hasText: 'Fit Page' }).click();
  await expect(zoomStatus(page)).toHaveText(/^Fit Page \(\d+%\)$/u);
  // Scrolling the viewer updates the page.
  await viewer.locator('.viewport').evaluate(viewport => viewport.scrollBy(0, viewport.clientHeight * 3));
  await expect(statusBarEntry(page, /^Page (9|10|11|12) \/ 12$/u)).toBeVisible();
});

test('editor title actions zoom, fit and switch the selection tool', async ({ workbench: page }) => {
  await openFile(page, PDF);
  const viewer = await pdfViewer(page);
  await expect(zoomStatus(page)).toHaveText(/^Fit Width/u);

  // One fit button, offering the fit not in use.
  await editorTitleAction(page, 'Fit Page');
  await expect(zoomStatus(page)).toHaveText(/^Fit Page/u);
  const fitted = zoomPercent(await zoomStatus(page).innerText());
  await editorTitleAction(page, 'Zoom In');
  await expect(zoomStatus(page)).toHaveText(/^\d+%$/u);
  expect(zoomPercent(await zoomStatus(page).innerText())).toBeGreaterThan(fitted);
  await editorTitleAction(page, 'Zoom Out');
  await editorTitleAction(page, 'Zoom Out');
  await expect.poll(async () => zoomPercent(await zoomStatus(page).innerText())).toBeLessThan(fitted);
  await editorTitleAction(page, 'Fit Width');
  await expect(zoomStatus(page)).toHaveText(/^Fit Width/u);

  await editorTitleAction(page, 'Find in PDF');
  await expect(viewer.getByRole('searchbox', { name: 'Find in PDF' })).toBeFocused();
  await page.keyboard.press('Escape');

  // The Select Region tool draws a region over text, and Ask Agent still works on it.
  await editorTitleAction(page, 'Fit Page');
  await showPage(page, viewer, 1);
  await editorTitleAction(page, 'Select Region Tool');
  await expect.poll(() => tool(viewer)).toBe('region');
  const at = await pagePoint(viewer, 1);
  await drag(page, at(74, 90), at(205, 140));
  await expect(viewer.getByRole('toolbar', { name: 'PDF region actions' })).toBeVisible();
  await editorTitleAction(page, 'Copy for Agent');
  await expect(page.getByText('Selection copied for agent.', { exact: true })).toBeVisible();
  await command(page, 'Notifications: Clear All Notifications');
  await editorTitleAction(page, 'Select Text Tool');
  await expect.poll(() => tool(viewer)).toBe('text');
});

test('keyboard shortcuts page, zoom, fit, find and pick the tool while the PDF has focus', async ({ workbench: page }) => {
  await openFile(page, PDF);
  const viewer = await pdfViewer(page);
  await expect(statusBarEntry(page, /^Page 1 \/ 12$/u)).toBeVisible();
  await focusViewer(page, viewer, 1);
  const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';

  await page.keyboard.press('Alt+PageDown');
  await page.keyboard.press('Alt+PageDown');
  await expect(statusBarEntry(page, /^Page 3 \/ 12$/u)).toBeVisible();
  await page.keyboard.press('Alt+PageUp');
  await expect(statusBarEntry(page, /^Page 2 \/ 12$/u)).toBeVisible();

  await page.keyboard.press(`${modifier}+Alt+0`);
  await expect(zoomStatus(page)).toHaveText(/^Fit Page/u);
  const fitted = zoomPercent(await zoomStatus(page).innerText());
  await page.keyboard.press(`${modifier}+Equal`);
  await expect(zoomStatus(page)).toHaveText(/^\d+%$/u);
  expect(zoomPercent(await zoomStatus(page).innerText())).toBeGreaterThan(fitted);
  await page.keyboard.press(`${modifier}+Minus`);
  await page.keyboard.press(`${modifier}+Minus`);
  await expect.poll(async () => zoomPercent(await zoomStatus(page).innerText())).toBeLessThan(fitted);
  await page.keyboard.press(`${modifier}+0`);
  await expect(zoomStatus(page)).toHaveText(/^Fit Width/u);

  await page.keyboard.press('Control+g');
  const input = quickInputTitled(page, /^Go to Page/u);
  await expect(input).toBeVisible();
  await input.fill('9');
  await input.press('Enter');
  await expect(statusBarEntry(page, /^Page 9 \/ 12$/u)).toBeVisible();

  await focusViewer(page, viewer, 9);
  await page.keyboard.press(`${modifier}+Alt+r`);
  await expect.poll(() => tool(viewer)).toBe('region');
  await page.keyboard.press('Escape');
  await expect.poll(() => tool(viewer)).toBe('text');

  await page.keyboard.press(`${modifier}+f`);
  await expect(viewer.getByRole('searchbox', { name: 'Find in PDF' })).toBeFocused();
  await page.keyboard.press('Escape');
});

test('the toolbar setting moves the controls into the viewer and back, live', async ({ workbench: page }) => {
  await openFile(page, PDF);
  const viewer = await pdfViewer(page);
  await expect(statusBarEntry(page, PAGE_STATUS)).toBeVisible();
  try {
    await setToolbarMode(page, /Slim Bar/u);
    await expect(viewer.getByRole('toolbar', { name: 'PDF toolbar' })).toContainText('of 12');
    await expect(statusBarEntry(page, PAGE_STATUS)).toHaveCount(0);
    await expect(page.locator('.editor-actions').getByRole('button', { name: 'Zoom In' })).toHaveCount(0);

    await setToolbarMode(page, /None/u);
    await expect(viewer.getByRole('toolbar', { name: 'PDF toolbar' })).toHaveCount(0);
    await expect(statusBarEntry(page, PAGE_STATUS)).toHaveCount(0);
    // The commands still work.
    await command(page, 'PDF: Fit Page');
    await expect.poll(() => viewer.evaluate(() => {
      const viewport = document.querySelector('.viewport')!;
      return document.querySelector('.page[data-page-index="0"]')!.getBoundingClientRect().height <= viewport.clientHeight;
    })).toBe(true);
  } finally {
    await setToolbarMode(page, /Editor Title Bar/u);
  }
  await expect(statusBarEntry(page, PAGE_STATUS)).toBeVisible();
  await expect(viewer.getByRole('toolbar', { name: 'PDF toolbar' })).toHaveCount(0);
});
