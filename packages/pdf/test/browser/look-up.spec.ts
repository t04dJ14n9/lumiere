import { expect, test, type Page } from "@playwright/test";
import { send } from "./view-controls-support";
import {
  lastSelection,
  messages,
  open,
  pagePoint,
  TEXT_MIDLINE,
} from "./viewer-support";

// The text of the test PDF's first page is "Synthetic page 1", from x 72.
const SYNTHETIC = 100;
const PAGE = 155;

const lookUps = async (page: Page) =>
  (await messages(page)).filter((message) => message.type === "lookUp");

async function forceClick(page: Page, x: number, y: number): Promise<void> {
  await page.evaluate(
    ({ x, y }) => {
      const event = new MouseEvent("webkitmouseforcedown", {
        clientX: x,
        clientY: y,
        bubbles: true,
        cancelable: true,
      });
      (document.elementFromPoint(x, y) ?? document.body).dispatchEvent(event);
    },
    { x, y },
  );
}

test("with Look Up on, a force click on a word asks the host to look it up", async ({
  page,
}) => {
  await open(page);
  await send(page, { type: "lookUp", enabled: true });
  const at = await pagePoint(page, 1);
  const [x, y] = at(SYNTHETIC, TEXT_MIDLINE);
  await forceClick(page, x, y);
  await expect
    .poll(async () => (await lookUps(page)).at(-1))
    .toEqual({ type: "lookUp", word: "Synthetic", open: true });
  const [x2, y2] = at(PAGE, TEXT_MIDLINE);
  await forceClick(page, x2, y2);
  await expect
    .poll(async () => (await lookUps(page)).at(-1))
    .toEqual({ type: "lookUp", word: "page", open: true });
});

test("the context menu reports the word under the pointer, and nothing when there is none", async ({
  page,
}) => {
  await open(page);
  await send(page, { type: "lookUp", enabled: true });
  const at = await pagePoint(page, 1);
  const [x, y] = at(SYNTHETIC, TEXT_MIDLINE);
  await page.mouse.move(x, y);
  await page.waitForTimeout(400);
  await page.mouse.click(x, y, { button: "right" });
  await expect
    .poll(async () => (await lookUps(page)).at(-1))
    .toEqual({ type: "lookUp", word: "Synthetic", open: false });
  await send(page, { type: "lookUpRequest" });
  await expect
    .poll(async () => (await lookUps(page)).at(-1))
    .toEqual({ type: "lookUp", word: "Synthetic", open: true });
  // On empty page space the menu has no word to offer.
  const [ex, ey] = at(300, 500);
  await page.mouse.move(ex, ey);
  await page.waitForTimeout(400);
  await page.mouse.click(ex, ey, { button: "right" });
  await expect
    .poll(async () => (await lookUps(page)).at(-1))
    .toEqual({ type: "lookUp", word: null, open: false });
});

test("Look Up is off until the host turns it on, and off again when it says so", async ({
  page,
}) => {
  await open(page);
  const at = await pagePoint(page, 1);
  const [x, y] = at(SYNTHETIC, TEXT_MIDLINE);
  await forceClick(page, x, y);
  await page.mouse.click(x, y, { button: "right" });
  await page.waitForTimeout(500);
  expect(await lookUps(page)).toEqual([]);
  await send(page, { type: "lookUp", enabled: true });
  await send(page, { type: "lookUp", enabled: false });
  await forceClick(page, x, y);
  await page.waitForTimeout(500);
  expect(await lookUps(page)).toEqual([]);
});

test("text selection still works with Look Up on", async ({ page }) => {
  await open(page);
  await send(page, { type: "lookUp", enabled: true });
  const at = await pagePoint(page, 1);
  const [x1, y1] = at(74, TEXT_MIDLINE);
  const [x2, y2] = at(205, TEXT_MIDLINE);
  await page.mouse.move(x1, y1);
  await page.mouse.down();
  await page.mouse.move(x2, y2, { steps: 8 });
  await page.mouse.up();
  await expect.poll(() => lastSelection(page)).toMatchObject({ kind: "text" });
});
