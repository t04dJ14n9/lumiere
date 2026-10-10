import { expect, type Page } from "@playwright/test";

// The fixture (test/fixtures/make-fixtures.mjs): 12 pages of 300 x 400 points;
// "Synthetic page N" from x 72 to about 206 on a baseline 100 points down.
export const PAGE_WIDTH = 300;
export const TEXT_MIDLINE = 94;

export type Message = { type: string; [key: string]: unknown };

export async function open(page: Page, query = ""): Promise<void> {
  await page.goto(`/${query}`);
  await expect(page.locator('.page[data-page-index="0"] img')).toBeVisible();
}

/**
 * What the viewer sent, with each state `patch` spelled out as one message
 * per part (outline, selection, view), in the order the host applies them.
 */
export async function messages(page: Page): Promise<Message[]> {
  const sent = await page.evaluate(
    () => (window as unknown as { __messages: Message[] }).__messages,
  );
  return sent.flatMap((message) => {
    if (message.type !== "patch") return [message];
    const { outline, selection, view } = message.patch as Record<
      string,
      unknown
    >;
    return [
      ...(outline ? [{ type: "outline", items: outline }] : []),
      ...(view ? [{ type: "view", view }] : []),
      ...(selection ? [{ type: "selection", ...(selection as object) }] : []),
    ];
  });
}

export async function lastSelection(page: Page): Promise<unknown> {
  const all = await messages(page);
  return all.filter((message) => message.type === "selection").at(-1)
    ?.selection;
}

/** Map PDF points on page `number` (from its top-left) to screen pixels. */
export async function pagePoint(page: Page, number: number) {
  const box = (await page
    .locator(`.page[data-page-index="${number - 1}"]`)
    .boundingBox())!;
  const scale = box.width / PAGE_WIDTH;
  return (x: number, y: number): [number, number] => [
    box.x + x * scale,
    box.y + y * scale,
  ];
}

/**
 * Drag across text as a reader would: wait for the text cursor first. The
 * viewer reads a page's text layout after the page appears; a drag that
 * starts before then misses the first characters.
 */
export async function selectText(
  page: Page,
  from: [number, number],
  to: [number, number],
): Promise<void> {
  // The cursor changes on pointer movement, so keep nudging while waiting.
  let nudge = 0;
  await expect
    .poll(async () => {
      nudge = 1 - nudge;
      await page.mouse.move(from[0] + nudge, from[1]);
      return page.evaluate(
        ([x, y]) =>
          getComputedStyle(document.elementFromPoint(x, y) as Element).cursor,
        from,
      );
    })
    .toBe("text");
  await drag(page, from, to);
}

export async function drag(
  page: Page,
  from: [number, number],
  to: [number, number],
): Promise<void> {
  await page.mouse.move(...from);
  await page.mouse.down();
  await page.mouse.move(...to, { steps: 8 });
  await page.mouse.up();
}

/** How far page `number` starts below the top of the scrolling area, in pixels. */
export function pageOffset(
  page: Page,
  number: number,
): Promise<number | undefined> {
  return page.evaluate((index) => {
    const viewport = document
      .querySelector(".viewport")!
      .getBoundingClientRect();
    const element = document
      .querySelector(`.page[data-page-index="${index}"]`)
      ?.getBoundingClientRect();
    return element ? element.top - viewport.top : undefined;
  }, number - 1);
}

export async function lastView(page: Page): Promise<unknown> {
  const all = await messages(page);
  return all.filter((message) => message.type === "view").at(-1)?.view;
}

export function sendAction(
  page: Page,
  action: Record<string, unknown>,
): Promise<void> {
  return page.evaluate(
    (action) =>
      (window as unknown as { hostSend: (message: unknown) => void }).hostSend({
        type: "action",
        action,
      }),
    action,
  );
}
