import { expect, test, type Page } from '@playwright/test';

// The fixture (test/fixtures/make-fixtures.mjs): 12 pages of 300 x 400 points;
// "Synthetic page N" from x 72 to about 206 on a baseline 100 points down.
const PAGE_WIDTH = 300;
const TEXT_MIDLINE = 94;

type Message = { type: string; [key: string]: unknown };

async function open(page: Page, query = ''): Promise<void> {
  await page.goto(`/${query}`);
  await expect(page.locator('.page[data-page-index="0"] img')).toBeVisible();
}

function messages(page: Page): Promise<Message[]> {
  return page.evaluate(() => (window as unknown as { __messages: Message[] }).__messages);
}

async function lastSelection(page: Page): Promise<unknown> {
  const all = await messages(page);
  return all.filter(message => message.type === 'selection').at(-1)?.selection;
}

/** Map PDF points on page `number` (from its top-left) to screen pixels. */
async function pagePoint(page: Page, number: number) {
  const box = (await page.locator(`.page[data-page-index="${number - 1}"]`).boundingBox())!;
  const scale = box.width / PAGE_WIDTH;
  return (x: number, y: number): [number, number] => [box.x + x * scale, box.y + y * scale];
}

/**
 * Drag across text as a reader would: wait for the text cursor first. The
 * viewer reads a page's text layout after the page appears; a drag that
 * starts before then misses the first characters.
 */
async function selectText(page: Page, from: [number, number], to: [number, number]): Promise<void> {
  // The cursor changes on pointer movement, so keep nudging while waiting.
  let nudge = 0;
  await expect.poll(async () => {
    nudge = 1 - nudge;
    await page.mouse.move(from[0] + nudge, from[1]);
    return page.evaluate(([x, y]) => getComputedStyle(document.elementFromPoint(x, y) as Element).cursor, from);
  }).toBe('text');
  await drag(page, from, to);
}

async function drag(page: Page, from: [number, number], to: [number, number]): Promise<void> {
  await page.mouse.move(...from);
  await page.mouse.down();
  await page.mouse.move(...to, { steps: 8 });
  await page.mouse.up();
}

/** How far page `number` starts below the top of the scrolling area, in pixels. */
function pageOffset(page: Page, number: number): Promise<number | undefined> {
  return page.evaluate(index => {
    const viewport = document.querySelector('.viewport')!.getBoundingClientRect();
    const element = document.querySelector(`.page[data-page-index="${index}"]`)?.getBoundingClientRect();
    return element ? element.top - viewport.top : undefined;
  }, number - 1);
}

test('opens the PDF, shows the page count and reports the nested outline', async ({ page }) => {
  await open(page);
  await expect(page.getByRole('textbox', { name: 'Page' })).toHaveValue('1');
  await expect(page.getByRole('toolbar', { name: 'PDF toolbar' })).toContainText('of 12');
  await expect.poll(async () => (await messages(page)).find(message => message.type === 'outline')?.items).toEqual([
    { title: 'Part One', page: 1, children: [
      { title: 'Section 1.1', page: 2, children: [] },
      { title: 'Section 1.2', page: 3, children: [] },
    ] },
    { title: 'Part Two', page: 6, children: [{ title: 'Section 2.1', page: 9, children: [] }] },
  ]);
});

test('a text drag reports the exact text and its line box', async ({ page }) => {
  await open(page);
  const at = await pagePoint(page, 1);
  await selectText(page, at(74, TEXT_MIDLINE), at(205, TEXT_MIDLINE));
  await expect(page.getByRole('toolbar', { name: 'PDF text selection actions' })).toBeVisible();
  await expect.poll(() => lastSelection(page)).toMatchObject({ kind: 'text', text: 'Synthetic page 1' });
  const selection = await lastSelection(page) as { pages: { page: number; rects: number[][] }[] };
  expect(selection.pages).toHaveLength(1);
  const [left, top, right, bottom] = selection.pages[0]!.rects[0]!;
  expect(selection.pages[0]!.page).toBe(1);
  expect(left).toBeGreaterThan(70);
  expect(left).toBeLessThan(75);
  expect(right).toBeGreaterThan(200);
  expect(right).toBeLessThan(210);
  expect(top).toBeGreaterThan(80);
  expect(bottom).toBeLessThan(108);
});

test('Copy for Agent right after a text drag reports the selection before the copy', async ({ page }) => {
  await open(page);
  const at = await pagePoint(page, 1);
  await selectText(page, at(74, TEXT_MIDLINE), at(205, TEXT_MIDLINE));
  await page.getByRole('toolbar', { name: 'PDF text selection actions' })
    .getByRole('button', { name: 'Copy for Agent' }).click();
  await expect.poll(async () => (await messages(page)).some(message => message.type === 'copyForAgent')).toBe(true);
  const order = (await messages(page)).flatMap(message =>
    message.type === 'copyForAgent' ? ['copy']
      : message.type === 'selection' && (message.selection as { kind?: string } | null)?.kind === 'text' ? ['text'] : []);
  expect(order.indexOf('text')).toBeGreaterThanOrEqual(0);
  expect(order.indexOf('text')).toBeLessThan(order.indexOf('copy'));
});

test('a drag over empty space selects that region; Escape clears it', async ({ page }) => {
  await open(page);
  const at = await pagePoint(page, 1);
  await drag(page, at(150, 150), at(250, 250));
  const menu = page.getByRole('toolbar', { name: 'PDF region actions' });
  await expect(menu).toBeVisible();
  await expect.poll(() => lastSelection(page)).toMatchObject({ kind: 'region', page: 1 });
  const { rect } = await lastSelection(page) as { rect: number[] };
  const expected = [150, 150, 250, 250];
  rect.forEach((value, index) => expect(Math.abs(value - expected[index]!), `region ${rect.join(',')}`).toBeLessThan(1));

  await page.keyboard.press('Escape');
  await expect(menu).toHaveCount(0);
  await expect.poll(() => lastSelection(page)).toBeNull();
});

test('a location sent while the PDF loads opens its page and flashes its box', async ({ page }) => {
  const location = { page: 5, viewRect: { left: 72, top: 83, width: 134, height: 21 } };
  await page.goto(`/?goto=${encodeURIComponent(JSON.stringify(location))}`);
  const highlight = page.locator('.page[data-page-index="4"] .location-highlight');
  await expect(highlight).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Page' })).toHaveValue('5');
  const box = (await highlight.boundingBox())!;
  const viewport = (await page.locator('.viewport').boundingBox())!;
  expect(box.y).toBeGreaterThanOrEqual(viewport.y);
  expect(box.y + box.height).toBeLessThanOrEqual(viewport.y + viewport.height);
});

test('a page typed in the field opens at its top, and leaving the field does not move it', async ({ page }) => {
  await open(page);
  const field = page.getByRole('textbox', { name: 'Page' });
  await field.fill('7');
  await field.press('Enter');
  await expect.poll(() => pageOffset(page, 7)).toBeLessThanOrEqual(16);
  const before = await pageOffset(page, 7);
  const at = await pagePoint(page, 7);
  await page.mouse.click(...at(20, 380));
  await page.waitForTimeout(300);
  expect(await pageOffset(page, 7)).toBe(before);
});

test('links in the PDF open their page, or ask the extension to open a web address', async ({ page }) => {
  await open(page);
  await page.getByRole('link', { name: 'Go to page 5' }).click();
  await expect(page.getByRole('textbox', { name: 'Page' })).toHaveValue('5');

  await page.getByRole('textbox', { name: 'Page' }).fill('2');
  await page.getByRole('textbox', { name: 'Page' }).press('Enter');
  await page.getByRole('link', { name: 'Open https://example.com/paper' }).click();
  await expect.poll(async () => (await messages(page)).find(message => message.type === 'openExternal'))
    .toEqual({ type: 'openExternal', url: 'https://example.com/paper' });
});

test('search counts matches across pages and steps through them', async ({ page }) => {
  await open(page);
  await page.keyboard.press('ControlOrMeta+f');
  const input = page.getByRole('searchbox', { name: 'Find in PDF' });
  await expect(input).toBeFocused();
  await input.fill('Second line');
  await expect(page.locator('.search-count')).toHaveText('1 of 12');
  await input.press('Enter');
  await expect(page.locator('.search-count')).toHaveText('2 of 12');
  await input.press('Escape');
  await expect(input).toHaveCount(0);
});

test('zoom buttons and the zoom field change the zoom', async ({ page }) => {
  await open(page);
  const zoom = page.getByRole('textbox', { name: 'Zoom' });
  const initial = Number(await zoom.inputValue());
  await page.getByRole('button', { name: 'Zoom in' }).click();
  await expect.poll(async () => Number(await zoom.inputValue())).toBeGreaterThan(initial);
  await zoom.fill('50');
  await zoom.press('Enter');
  await expect(zoom).toHaveValue('50');
  const width = (await page.locator('.page[data-page-index="0"]').boundingBox())!.width;
  expect(Math.round(width)).toBe(150);
});

test('the copy command copies the selected text', async ({ page }) => {
  await open(page);
  const at = await pagePoint(page, 1);
  await selectText(page, at(74, TEXT_MIDLINE), at(205, TEXT_MIDLINE));
  await expect.poll(() => lastSelection(page)).toMatchObject({ text: 'Synthetic page 1' });
  const copied = await page.evaluate(() => {
    let text = '';
    const read = (event: ClipboardEvent) => { text = event.clipboardData?.getData('text/plain') ?? ''; };
    document.addEventListener('copy', read);
    document.execCommand('copy');
    document.removeEventListener('copy', read);
    return text;
  });
  expect(copied).toBe('Synthetic page 1');
});
