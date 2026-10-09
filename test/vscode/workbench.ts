/**
 * Helpers for driving the real VS Code window: the command palette, Quick
 * Open, and the PDF viewer inside its webview.
 */
import { chromium, expect, test as base, type Browser, type Frame, type Page } from '@playwright/test';
import { readState } from './state';

export { expect };
const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';
/** Fixture pages are 300 points wide (test/fixtures/make-fixtures.mjs). */
export const PAGE_WIDTH = 300;

/** `workbench`: VS Code's main window, with every editor closed first. */
export const test = base.extend<{ workbench: Page }>({
  // Playwright fixtures take their dependencies as an (empty) object pattern.
  // eslint-disable-next-line no-empty-pattern
  workbench: async ({}, use) => {
    const browser = await chromium.connectOverCDP(readState().webSocket);
    const page = await findWorkbench(browser);
    await closeAllEditors(page);
    await use(page);
    await browser.close();
  },
});

async function findWorkbench(browser: Browser): Promise<Page> {
  let workbench: Page | undefined;
  await expect.poll(async () => {
    for (const page of browser.contexts().flatMap(context => context.pages())) {
      if (await page.locator('.monaco-workbench .part.editor').count()) {
        workbench = page;
        return true;
      }
    }
    return false;
  }, { message: 'The VS Code window did not open', timeout: 60_000 }).toBe(true);
  return workbench!;
}

async function quickInput(page: Page, shortcut: string, text: string): Promise<void> {
  const widget = page.locator('.quick-input-widget');
  if (await widget.isVisible()) await page.keyboard.press('Escape');
  await page.locator('.monaco-workbench').click({ position: { x: 20, y: 20 } });
  await page.keyboard.press(shortcut);
  await expect(widget).toBeVisible();
  await widget.locator('input:visible').fill(text);
}

/** Run a command from the command palette by its label. */
export async function command(page: Page, label: string): Promise<void> {
  await quickInput(page, `${modifier}+Shift+P`, `>${label}`);
  const item = page.locator('.quick-input-list .monaco-list-row').filter({ hasText: label }).first();
  await item.click();
  await page.mouse.move(0, 0);
}

/** Open a workspace file with Quick Open. */
export async function openFile(page: Page, relativePath: string): Promise<void> {
  await quickInput(page, `${modifier}+P`, relativePath);
  const name = relativePath.split('/').at(-1)!;
  await page.locator('.quick-input-list .monaco-list-row').filter({ hasText: name }).first().click();
  await expect(page.locator('.quick-input-widget')).toBeHidden();
  await page.mouse.move(0, 0);
}

export async function closeAllEditors(page: Page): Promise<void> {
  if (await page.locator('.tabs-container .tab').count()) await command(page, 'View: Close All Editor Groups');
  await expect(page.locator('.tabs-container .tab')).toHaveCount(0);
}

/** The visible PDF viewer, inside VS Code's webview frames. */
export async function pdfViewer(page: Page): Promise<Frame> {
  let viewer: Frame | undefined;
  await expect.poll(async () => {
    for (const frame of page.frames()) {
      try {
        if (await frame.locator('.viewer .page').count() && await (await frame.frameElement()).isVisible()) {
          viewer = frame;
          return true;
        }
      } catch {
        // The frame went away while a tab was changing.
      }
    }
    return false;
  }, { message: 'The PDF viewer did not open', timeout: 30_000 }).toBe(true);
  return viewer!;
}

/** Whether 1-based page `number` starts at the top of the viewer. */
export function pageAtTop(viewer: Frame, number: number): Promise<boolean> {
  return viewer.evaluate(index => {
    const viewport = document.querySelector('.viewport')!.getBoundingClientRect();
    const page = document.querySelector(`.page[data-page-index="${index}"]`)?.getBoundingClientRect();
    return Boolean(page) && Math.abs(page!.top - viewport.top) <= 16;
  }, number - 1);
}

/** Whether the point `top` PDF points down 1-based page `number` is at the top of the viewer. */
export function pointAtTop(viewer: Frame, number: number, top: number): Promise<boolean> {
  return viewer.evaluate(([index, top, pageWidth]) => {
    const viewport = document.querySelector('.viewport')!.getBoundingClientRect();
    const page = document.querySelector(`.page[data-page-index="${index}"]`)?.getBoundingClientRect();
    return Boolean(page) && Math.abs(page!.top + top * (page!.width / pageWidth) - viewport.top) <= 2;
  }, [number - 1, top, PAGE_WIDTH] as const);
}

/**
 * Fit whole pages in the viewer, so every point of a page is on screen. The
 * default fit-to-width zoom can make the narrow fixture pages taller than the
 * window.
 */
export async function fitPage(viewer: Frame): Promise<void> {
  const zoom = viewer.getByRole('textbox', { name: 'Zoom' });
  const before = await zoom.inputValue();
  await viewer.getByRole('button', { name: 'Fit page' }).click();
  await expect(zoom).not.toHaveValue(before);
}

/** Show a page through the page field and wait until it is at the top. */
export async function showPage(viewer: Frame, number: number): Promise<void> {
  const field = viewer.getByRole('textbox', { name: 'Page' });
  await field.fill('');
  await field.fill(String(number));
  await field.press('Enter');
  await expect.poll(() => pageAtTop(viewer, number)).toBe(true);
  await expect(viewer.locator(`.page[data-page-index="${number - 1}"] img`)).toBeVisible();
}

/**
 * A point given in PDF points on page `number`, both for the mouse (window
 * pixels) and inside the viewer frame (for `elementFromPoint`).
 */
export async function pagePoint(viewer: Frame, number: number) {
  const page = viewer.locator(`.page[data-page-index="${number - 1}"]`);
  const onScreen = (await page.boundingBox())!;
  const inFrame = await page.evaluate(element => {
    const box = element.getBoundingClientRect();
    return { x: box.x, y: box.y };
  });
  const scale = onScreen.width / PAGE_WIDTH;
  return (x: number, y: number) => ({
    screen: [onScreen.x + x * scale, onScreen.y + y * scale] as [number, number],
    frame: [inFrame.x + x * scale, inFrame.y + y * scale] as [number, number],
  });
}

type Point = { screen: [number, number]; frame: [number, number] };

export async function drag(page: Page, from: Point, to: Point): Promise<void> {
  await page.mouse.move(...from.screen);
  await page.mouse.down();
  await page.mouse.move(...to.screen, { steps: 8 });
  await page.mouse.up();
}

/** Drag across text once the viewer shows a text cursor there, as a reader would. */
export async function selectText(page: Page, viewer: Frame, from: Point, to: Point): Promise<void> {
  // The cursor changes on pointer movement, so keep nudging while waiting.
  let nudge = 0;
  await expect.poll(async () => {
    nudge = 1 - nudge;
    await page.mouse.move(from.screen[0] + nudge, from.screen[1]);
    return viewer.evaluate(([x, y]) => getComputedStyle(document.elementFromPoint(x, y) as Element).cursor, from.frame);
  }).toBe('text');
  await drag(page, from, to);
}
