import { expect, type Page } from "@playwright/test";
import type { HostMessage } from "../../src/shared/messages";
import type { ViewState, ViewerAction } from "../../src/shared/view-state";

export async function openView(
  page: Page,
  settings: object = {},
  toolbar = "slim",
  extra = "",
): Promise<void> {
  await page.goto(
    `/?toolbar=${toolbar}&view=${encodeURIComponent(JSON.stringify(settings))}${extra}`,
  );
  await expect(page.locator(".page img").first()).toBeVisible();
  await expect.poll(() => lastView(page)).not.toBeUndefined();
  await page.evaluate(async () => {
    await new Promise(requestAnimationFrame);
    await new Promise(requestAnimationFrame);
  });
}

export async function send(
  page: Page,
  message: Exclude<HostMessage, { type: "load" }>,
): Promise<void> {
  await page.evaluate(
    (message) =>
      (window as unknown as { hostSend(message: unknown): void }).hostSend(
        message,
      ),
    message,
  );
}

export async function act(page: Page, action: ViewerAction): Promise<void> {
  await send(page, { type: "action", action });
}

export function lastView(page: Page): Promise<ViewState | undefined> {
  return page.evaluate(() => {
    const messages = (
      window as unknown as { __messages: { patch?: { view?: ViewState } }[] }
    ).__messages;
    return messages.filter((message) => message.patch?.view).at(-1)?.patch
      ?.view;
  });
}

export async function viewMenu(page: Page): Promise<void> {
  await page
    .getByRole("button", { name: "View controls", exact: true })
    .click();
  await expect(
    page.getByRole("group", { name: "PDF view controls" }),
  ).toBeVisible();
}

export function pageIndexes(page: Page): Promise<number[]> {
  return page
    .locator(".page")
    .evaluateAll((pages) =>
      pages.map((page) => Number((page as HTMLElement).dataset.pageIndex)),
    );
}

/** Measure the rendered pair, rather than assuming native spread mode from UI state. */
export function spreadGeometry(page: Page, indexes: number[]) {
  return page.locator(".viewport").evaluate((viewport, indexes) => {
    const boxes = indexes.map((index) =>
      viewport
        .querySelector(`.page[data-page-index="${index}"]`)
        ?.getBoundingClientRect(),
    );
    if (boxes.some((box) => !box)) return undefined;
    const pages = boxes.map((box) => box!);
    const frame = viewport.getBoundingClientRect();
    const left = Math.min(...pages.map((box) => box.left));
    const right = Math.max(...pages.map((box) => box.right));
    const top = Math.min(...pages.map((box) => box.top));
    const bottom = Math.max(...pages.map((box) => box.bottom));
    return {
      paired:
        pages.length === 2 &&
        Math.abs(pages[0]!.top - pages[1]!.top) < 1 &&
        pages[1]!.left > pages[0]!.right,
      fitsWidth:
        left >= frame.left - 1 &&
        right <= frame.left + viewport.clientWidth + 1,
      fitsHeight:
        top >= frame.top - 1 &&
        bottom <= frame.top + viewport.clientHeight + 1,
      fillsWidth: right - left >= viewport.clientWidth - 32,
      fillsHeight: bottom - top >= viewport.clientHeight - 32,
    };
  }, indexes);
}
