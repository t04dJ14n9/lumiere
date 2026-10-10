import { expect, test, type Page } from '@playwright/test';
import type { ViewerMessage } from '../../src/shared/messages';
import { openView, send } from './view-controls-support';

async function messages<T extends ViewerMessage['type']>(page: Page, type: T): Promise<Extract<ViewerMessage, { type: T }>[]> {
  return page.evaluate(type => (window as unknown as { __messages: ViewerMessage[] }).__messages.filter(message => message.type === type), type) as Promise<Extract<ViewerMessage, { type: T }>[]>;
}

/** Native currentPage is the most-visible page, not the precise viewport anchor. */
async function topOffset(page: Page, pageNumber: number): Promise<number | null> {
  return page.evaluate(pageNumber => {
    const viewport = document.querySelector('.viewport')?.getBoundingClientRect();
    const element = document.querySelector<HTMLElement>(`.page[data-page-index="${pageNumber - 1}"]`);
    const box = element?.getBoundingClientRect();
    const scale = Number(element?.dataset.scale);
    if (!viewport || !box || !(scale > 0) || box.bottom <= viewport.top || box.top >= viewport.bottom) return null;
    return (viewport.top - box.top) / scale;
  }, pageNumber);
}

test('a deliberate coordinate jump reports its origin and replay adds no new jump', async ({ page }) => {
  await openView(page, { defaultZoom: 100, smoothScrolling: false });
  await send(page, { type: 'goTo', location: { page: 3 }, top: 130 });
  await expect.poll(async () => (await messages(page, 'historyJump')).length).toBe(1);
  const jump = (await messages(page, 'historyJump'))[0]!;
  expect(jump.from.page).toBe(1);
  expect(jump.to.page).toBe(3);
  expect(jump.to.top).toBeCloseTo(130, 0);
  await send(page, { type: 'historyCapture', token: 91 });
  await expect.poll(async () => (await messages(page, 'historyCaptured')).length).toBe(1);
  const capture = (await messages(page, 'historyCaptured'))[0]!;
  await send(page, { type: 'historyRestore', token: 92, position: jump.from, expectedIntent: capture.intent });
  await expect.poll(async () => (await messages(page, 'historyRestored')).at(-1)?.ok).toBe(true);
  const restored = (await messages(page, 'historyRestored')).at(-1)!;
  expect(restored.position).toMatchObject({ page: jump.from.page, zoom: jump.from.zoom, pageLayout: jump.from.pageLayout, scrollMode: jump.from.scrollMode, scrollDirection: jump.from.scrollDirection });
  expect(restored.position.top).toBeCloseTo(jump.from.top, 0);
  expect(restored.position.left).toBeCloseTo(jump.from.left, 0);
  await expect.poll(() => topOffset(page, jump.from.page)).toBeCloseTo(jump.from.top, 0);
  expect((await messages(page, 'historyJump')).length).toBe(1);
  await page.locator('.viewport').hover();
  await page.mouse.wheel(0, 200);
  await page.waitForTimeout(300);
  expect((await messages(page, 'historyJump')).length).toBe(1);
});

test('new navigation during the capture/restore round trip rejects a stale restore', async ({ page }) => {
  await openView(page, { defaultZoom: 100, smoothScrolling: false });
  await send(page, { type: 'historyCapture', token: 101 });
  await expect.poll(async () => (await messages(page, 'historyCaptured')).length).toBe(1);
  const capture = (await messages(page, 'historyCaptured'))[0]!;
  await send(page, { type: 'goTo', location: { page: 9 }, top: 0 });
  await expect.poll(() => topOffset(page, 9)).toBeCloseTo(0, 0);
  await send(page, { type: 'historyRestore', token: 102, position: capture.position, expectedIntent: capture.intent });
  await expect.poll(async () => (await messages(page, 'historyRestored')).at(-1)?.ok).toBe(false);
  await expect.poll(() => topOffset(page, 9)).toBeCloseTo(0, 0);
});

test('history controls are distinct from page controls and send their own requests', async ({ page }) => {
  await openView(page);
  await expect(page.getByRole('button', { name: 'Back to previous location', exact: true })).toBeDisabled();
  await send(page, { type: 'historyState', back: true, forward: false });
  await page.getByRole('button', { name: 'Back to previous location', exact: true }).click();
  await expect.poll(async () => (await messages(page, 'historyTraverse')).at(-1)?.direction).toBe('back');
  await expect(page.getByRole('button', { name: 'Previous page', exact: true })).toBeVisible();
});

test('Enter commits the first search preview with the origin from before searching', async ({ page }) => {
  await openView(page, { smoothScrolling: false });
  await send(page, { type: 'goTo', location: { page: 5 }, top: 0 });
  await expect.poll(async () => (await messages(page, 'historyJump')).length).toBe(1);
  await page.getByRole('button', { name: 'Find in PDF', exact: true }).click();
  const input = page.getByRole('searchbox', { name: 'Find in PDF' });
  await input.fill('Synthetic page 8');
  await expect(page.locator('.search-count')).toHaveText('1 of 1');
  await expect.poll(() => topOffset(page, 8)).not.toBeNull();
  const previewOffset = (await topOffset(page, 8))!;
  expect((await messages(page, 'historyJump')).length).toBe(1);
  await input.press('Enter'); // Same sole match: explicit acceptance still records the departure.
  await expect.poll(async () => (await messages(page, 'historyJump')).length).toBe(2);
  const accepted = (await messages(page, 'historyJump')).at(-1)!;
  expect(accepted.from.page).toBe(5);
  expect(accepted.from.top).toBeCloseTo(0, 0);
  await expect.poll(() => topOffset(page, 8)).toBeCloseTo(previewOffset, 0);
  await input.press('Escape');
  await send(page, { type: 'historyCapture', token: 111 });
  await expect.poll(async () => (await messages(page, 'historyCaptured')).length).toBe(1);
  const captured = (await messages(page, 'historyCaptured'))[0]!;
  await send(page, { type: 'historyRestore', token: 112, position: accepted.from, expectedIntent: captured.intent });
  await expect.poll(async () => (await messages(page, 'historyRestored')).at(-1)?.ok).toBe(true);
  await expect.poll(() => topOffset(page, 5)).toBeCloseTo(accepted.from.top, 0);
});

test('scrolling after a passive search preview makes explicit acceptance leave the new viewport', async ({ page }) => {
  await openView(page, { smoothScrolling: false });
  await send(page, { type: 'goTo', location: { page: 5 }, top: 0 });
  await expect.poll(async () => (await messages(page, 'historyJump')).length).toBe(1);
  await page.getByRole('button', { name: 'Find in PDF', exact: true }).click();
  const input = page.getByRole('searchbox', { name: 'Find in PDF' });
  await input.fill('Synthetic page 8');
  await expect(page.locator('.search-count')).toHaveText('1 of 1');
  await expect.poll(() => topOffset(page, 8)).not.toBeNull();
  await page.locator('.viewport').hover();
  await page.mouse.wheel(0, 350);
  await expect.poll(() => topOffset(page, 8)).toBeGreaterThan(0);
  const departure = (await topOffset(page, 8))!;
  await input.press('Enter');
  await expect.poll(async () => (await messages(page, 'historyJump')).length).toBe(2);
  const accepted = (await messages(page, 'historyJump')).at(-1)!;
  expect(accepted.from.page).toBe(8);
  expect(accepted.from.top).toBeCloseTo(departure, 0);
});
