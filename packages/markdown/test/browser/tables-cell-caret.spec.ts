/**
 * The caret at the end of a long cell stays whole, and the cell's text does
 * not scroll sideways inside the cell to reveal it.
 */
import { expect, test, type Page } from "@playwright/test";
import { open } from "./harness";

/**
 * How much of the drawn caret its clipping ancestors hide, and how far the
 * cell's text is scrolled sideways, once the editor has measured and drawn.
 */
async function caretClipping(page: Page) {
  await page.evaluate(async () => {
    for (let frame = 0; frame < 3; frame++) {
      await new Promise(requestAnimationFrame);
    }
  });
  return page.evaluate(() => {
    const editor = document.querySelector(".hybrid-table .cm-editor")!;
    // Vim's block caret is our own layer; otherwise CodeMirror draws a bar.
    const element = [
      ...editor.querySelectorAll(".mw-caret, .cm-cursor-primary"),
    ].find((candidate) => candidate.getBoundingClientRect().width > 0)!;
    const caret = element.getBoundingClientRect();
    let left = caret.left;
    let right = caret.right;
    for (let node = element.parentElement; node; node = node.parentElement) {
      if (getComputedStyle(node).overflowX === "visible") {
        continue;
      }
      const box = node.getBoundingClientRect();
      left = Math.max(left, box.left + node.clientLeft);
      right = Math.min(right, box.left + node.clientLeft + node.clientWidth);
    }
    const scroller = editor.querySelector(".cm-scroller")!;
    const line = editor.querySelector(".cm-line")!;
    return {
      hidden: Math.round(caret.width - Math.max(0, right - left)),
      textShift: Math.round(
        scroller.getBoundingClientRect().left -
          line.getBoundingClientRect().left,
      ),
    };
  });
}

for (const vim of [false, true]) {
  test(`the caret at the end of a long cell is not clipped (vim=${vim})`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 900, height: 600 });
    const long = Array.from({ length: 40 }, (_, i) => `word${i}`).join(" ");
    const source = `Before\n\n| A | B |\n| --- | --- |\n| ${long} | short |\n\nAfter`;
    await open(page, source, "obsidian", {
      features: { vim: { enabled: vim, config: {} } },
    });
    await page.evaluate(() => window.harness.reveal(0));
    const cell = page.locator(".hybrid-table td .table-cell-content").first();
    const box = (await cell.boundingBox())!;
    await page.mouse.click(box.x + 5, box.y + box.height / 2);
    await expect(page.locator(".hybrid-table .cm-editor")).toHaveCount(1);
    // Vim's block caret sits on the last character, the bar after it.
    await page.keyboard.press(vim ? "$" : "End");
    expect(await caretClipping(page)).toEqual({ hidden: 0, textShift: 0 });

    // Typing at the end keeps the caret whole as the cell grows.
    if (vim) {
      await page.keyboard.press("A");
    }
    await page.keyboard.type(" and more text");
    expect(await caretClipping(page)).toEqual({ hidden: 0, textShift: 0 });
  });
}
