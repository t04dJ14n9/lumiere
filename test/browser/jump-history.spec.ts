import { expect, test, type Page } from '@playwright/test';
import type { ViewerMessage } from '../../src/shared/messages';
import { lastView, openView, send } from './view-controls-support';

async function messages<T extends ViewerMessage['type']>(page: Page, type: T): Promise<Extract<ViewerMessage, { type: T }>[]> {
  return page.evaluate(type => (window as unknown as { __messages: ViewerMessage[] }).__messages.filter(message => message.type === type), type) as Promise<Extract<ViewerMessage, { type: T }>[]>;
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
  await expect.poll(async () => (await lastView(page))?.page).toBe(1);
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
  await send(page, { type: 'goTo', location: { page: 9 } });
  await expect.poll(async () => (await lastView(page))?.page).toBe(9);
  await send(page, { type: 'historyRestore', token: 102, position: capture.position, expectedIntent: capture.intent });
  await expect.poll(async () => (await messages(page, 'historyRestored')).at(-1)?.ok).toBe(false);
  await expect.poll(async () => (await lastView(page))?.page).toBe(9);
});

test('history controls are distinct from page controls and send their own requests', async ({ page }) => {
  await openView(page);
  await expect(page.getByRole('button', { name: 'Back to previous location', exact: true })).toBeDisabled();
  await send(page, { type: 'historyState', back: true, forward: false });
  await page.getByRole('button', { name: 'Back to previous location', exact: true }).click();
  await expect.poll(async () => (await messages(page, 'historyTraverse')).at(-1)?.direction).toBe('back');
  await expect(page.getByRole('button', { name: 'Previous page', exact: true })).toBeVisible();
});
