import type { Frame, Page } from '@playwright/test';
import {
  PAGE_STATUS,
  ZOOM_STATUS,
  agentChatInput,
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
  withoutSpaces,
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
  // The status bar shows a page as soon as it is reached; wait for it to settle at the top.
  await expect.poll(() => pageAtTop(viewer, pageNumber)).toBe(true);
  const at = await pagePoint(viewer, pageNumber);
  await page.mouse.click(...at(20, 20).screen);
}

/**
 * Wait until the pages have stopped scrolling and resizing: after a zoom the
 * pages are laid out again and the viewer scrolls back to its place, and that
 * can start a moment after the zoom is reported.
 */
async function scrollSettled(viewer: Frame): Promise<void> {
  const layout = () => viewer.evaluate(() => {
    const viewport = document.querySelector('.viewport')!;
    return `${viewport.scrollTop}:${viewport.scrollHeight}`;
  });
  let last = await layout();
  let stillFor = 0;
  await expect.poll(async () => {
    const now = await layout();
    stillFor = now === last ? stillFor + 1 : 0;
    last = now;
    return stillFor >= 3;
  }, { intervals: [200] }).toBe(true);
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
  await page.locator('.quick-input-list .monaco-list-row').filter({ hasText: 'Fit Page' }).first().click();
  await expect(zoomStatus(page)).toHaveText(/^Fit Page \(\d+%\)$/u);
  // Scrolling the viewer updates the page.
  await viewer.locator('.viewport').evaluate(viewport => viewport.scrollBy(0, viewport.clientHeight * 3));
  await expect(statusBarEntry(page, /^Page (9|10|11|12) \/ 12$/u)).toBeVisible();
});

test('editor title actions zoom, fit and switch the selection tool', async ({ workbench: page }) => {
  // Cursor keeps these actions in the "…" menu: each one first waits for its button, then opens the menu.
  test.slow(inCursor);
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

  // The Select Region tool draws a region over text, and Copy Link for Agent still works on it.
  await editorTitleAction(page, 'Fit Page');
  await showPage(page, viewer, 1);
  await editorTitleAction(page, 'Select Region Tool');
  await expect.poll(() => tool(viewer)).toBe('region');
  const at = await pagePoint(viewer, 1);
  await drag(page, at(74, 90), at(205, 140));
  await expect(viewer.getByRole('toolbar', { name: 'PDF region actions' })).toBeVisible();
  await editorTitleAction(page, 'Copy Link for Agent');
  await expect.poll(() => agentChatInput(page), { timeout: 15_000 })
    .toContain(withoutSpaces(`Source: [${PDF} (page 1 region)](<${PDF}#page=1&viewrect=`));
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
  // The viewer scrolls to keep its place just after a zoom; a page asked
  // for meanwhile would be scrolled away from.
  await scrollSettled(viewer);

  await page.keyboard.press('Control+g');
  const input = quickInputTitled(page, /^Go to Page/u);
  await expect(input).toHaveValue(/^\d+$/u);
  await input.fill('9');
  await input.press('Enter');
  await expect(statusBarEntry(page, /^Page 9 \/ 12$/u)).toBeVisible();

  await focusViewer(page, viewer, 9);
  await page.keyboard.press(`${modifier}+Alt+r`);
  await expect.poll(() => tool(viewer)).toBe('region');
  // The command returns the focus to the viewer; Escape goes there once it has it.
  await expect.poll(() => viewer.evaluate(() => document.hasFocus())).toBe(true);
  await page.keyboard.press('Escape');
  await expect.poll(() => tool(viewer)).toBe('text');

  await page.keyboard.press(`${modifier}+f`);
  await expect(viewer.getByRole('searchbox', { name: 'Find in PDF' })).toBeFocused();
  await page.keyboard.press('Escape');
});

test('the toolbar setting moves the controls into the viewer and back, live', async ({ workbench: page }) => {
  await openFile(page, PDF);
  let viewer = await pdfViewer(page);
  await expect(statusBarEntry(page, PAGE_STATUS)).toBeVisible();
  try {
    await setToolbarMode(page, /Slim Bar/u);
    await expect(viewer.getByRole('toolbar', { name: 'PDF toolbar' })).toContainText('of 12');
    await expect(statusBarEntry(page, PAGE_STATUS)).toHaveCount(0);
    await expect(page.locator('.editor-actions').getByRole('button', { name: 'Zoom In' })).toHaveCount(0);
    // The bar's outline button shows the PDF Outline view, or hides the
    // side bar it is shown in.
    const outline = page.locator('.pane-header', { hasText: 'PDF Outline' });
    const entry = page.getByRole('treeitem', { name: /Part One/u });
    await expect(outline).toBeVisible();
    const toggle = viewer.getByRole('button', { name: 'Toggle outline' });
    // A fresh profile may have the view collapsed: then the button opens it.
    if (!await entry.isVisible()) {
      await toggle.click();
      await expect(entry).toBeVisible();
    }
    await toggle.click();
    await expect(outline).toBeHidden();
    await toggle.click();
    await expect(entry).toBeVisible();

    // The floating bar: dragged to an edge, it stays there for PDFs opened later.
    await setToolbarMode(page, /Floating Bar/u);
    const floating = viewer.getByRole('toolbar', { name: 'PDF toolbar' });
    await expect(floating).toHaveAttribute('aria-orientation', 'horizontal');
    const grip = floating.getByRole('button', { name: /^Move toolbar/u });
    const from = (await grip.boundingBox())!;
    const area = (await viewer.locator('.viewport').boundingBox())!;
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(area.x + area.width - 30, area.y + area.height / 2, { steps: 10 });
    await page.mouse.up();
    await expect(floating).toHaveAttribute('aria-orientation', 'vertical');
    await command(page, 'View: Close Editor');
    await openFile(page, PDF);
    viewer = await pdfViewer(page);
    const reopened = viewer.getByRole('toolbar', { name: 'PDF toolbar' });
    await expect(reopened).toHaveAttribute('aria-orientation', 'vertical');
    // Back to the bottom, with the keyboard.
    await reopened.getByRole('button', { name: /^Move toolbar/u }).focus();
    await page.keyboard.press('ArrowDown');
    await expect(reopened).toHaveAttribute('aria-orientation', 'horizontal');

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
