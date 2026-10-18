/**
 * The Vim caret against what VSCodeVim's caret looks like in VS Code 1.141
 * (docs/vim-caret.md, docs/vim-caret-measurements/): whole-pixel snapping, the
 * insert line straddling the character edge, the visual end caret, and
 * movement that VSCodeVim makes from code, which `explicit` smooth animation
 * therefore skips. The real-editor numbers are checked in
 * `test/vscode/vim-caret.spec.ts`.
 */
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { open } from "./harness";

async function configure(page: Page, values: Record<string, unknown>) {
  await page.evaluate((values) => window.harness.configureEditor(values), {
    fontFamily: "monospace",
    fontSize: 17,
    cursorStyle: "line",
    cursorWidth: 0,
    cursorBlinking: "solid",
    cursorSmoothCaretAnimation: "off",
    ...values,
  });
}

/** Polls the first caret box until `ok` accepts it (carets are measured after the key). */
async function settled(
  page: Page,
  ok: (caret: Awaited<ReturnType<typeof carets>>[number]) => boolean,
) {
  await expect
    .poll(async () => ok((await carets(page))[0]!), { timeout: 5000 })
    .toBe(true);
  return carets(page);
}

/** The caret boxes in CSS pixels, relative to the first line's text start. */
async function carets(page: Page) {
  return page.evaluate(() => {
    const line = document.querySelector<HTMLElement>(".cm-line")!;
    const start = (() => {
      const walker = document.createTreeWalker(line, NodeFilter.SHOW_TEXT);
      const range = document.createRange();
      const text = walker.nextNode()!;
      range.setStart(text, 0);
      range.setEnd(text, 1);
      return range.getBoundingClientRect().left;
    })();
    return [...document.querySelectorAll<HTMLElement>(".mw-caret")].map(
      (caret) => {
        const box = caret.getBoundingClientRect();
        return {
          part: caret.dataset.part,
          left: box.left - start,
          width: box.width,
          height: box.height,
        };
      },
    );
  });
}

test.describe("VSCodeVim caret parity", () => {
  test.beforeEach(async ({ page }) => {
    await open(page, "abcdefghij\n\nxyz", "obsidian", {
      features: { vim: { enabled: true, config: {} } },
    });
    await configure(page, {});
    await page.evaluate(() => window.harness.reveal(0));
    await page.keyboard.press("Escape");
  });

  test("normal blocks sit on whole pixels and are as wide as the rounded character", async ({
    page,
  }) => {
    const width = await page.evaluate(() => {
      const line = document.querySelector(".cm-line")!;
      const range = document.createRange();
      const text = document
        .createTreeWalker(line, NodeFilter.SHOW_TEXT)
        .nextNode()!;
      range.setStart(text, 0);
      range.setEnd(text, 1);
      return range.getBoundingClientRect().width;
    });
    expect(Number.isInteger(width)).toBe(false); // the check needs a fractional width
    for (let column = 0; column < 5; column++) {
      const exact = column * width;
      // A half pixel can round either way depending on float noise.
      if (Math.abs((exact % 1) - 0.5) < 0.01) {
        await page.keyboard.press("l");
        continue;
      }
      const [block] = await settled(
        page,
        (caret) => Math.abs(caret.left - Math.round(exact)) < 0.05,
      );
      expect(block!.width).toBe(Math.round(width));
      await page.keyboard.press("l");
    }
  });

  test("the insert line straddles the character edge, one pixel to its left", async ({
    page,
  }) => {
    await page.keyboard.press("l");
    await page.keyboard.press("l");
    // The block is read only once it has reached the third character.
    const [block] = await settled(page, (caret) => caret.left > 15);
    await page.keyboard.press("i");
    const [line] = await settled(page, (caret) => caret.width === 2);
    expect(line!.width).toBe(2);
    expect(line!.left).toBeCloseTo(block!.left - 1, 1);
    // At the start of the line there is nothing to straddle.
    await page.keyboard.press("Escape");
    await page.keyboard.press("0");
    await page.keyboard.press("i");
    await settled(page, (caret) => Math.abs(caret.left) < 0.05);
  });

  test("visual mode: the active character, a one-pixel caret after it, two pixels on an empty line", async ({
    page,
  }) => {
    await page.keyboard.press("v");
    await page.keyboard.press("l");
    const [block, end] = await expect
      .poll(async () => (await carets(page)).length)
      .toBe(2)
      .then(() => carets(page));
    expect(end!.part).toBe("end");
    expect(end!.width).toBe(1);
    expect(end!.left).toBeCloseTo(block!.left + block!.width, 0);
    await page.keyboard.press("Escape");
    await page.keyboard.press("j");
    await page.keyboard.press("v");
    await settled(page, (caret) => caret.width === 2);
  });

  test("Escape from insert steps one character left, from A to the last character", async ({
    page,
  }) => {
    await page.keyboard.press("A");
    const [line] = await settled(page, (caret) => caret.width === 2);
    await page.keyboard.press("Escape");
    const [block] = await settled(page, (caret) => caret.width > 5);
    expect(block!.left + block!.width).toBeCloseTo(line!.left + 1, 0);
  });

  test("with explicit smooth movement only a click animates; Vim motions do not, as in VSCodeVim", async ({
    page,
  }) => {
    await configure(page, { cursorSmoothCaretAnimation: "explicit" });
    const caret = page.locator(".mw-caret").first();
    await page.keyboard.press("l");
    await expect(caret).toHaveCSS("transition-duration", "0s");
    await page
      .locator(".cm-line")
      .first()
      .click({ position: { x: 90, y: 5 } });
    await expect(caret).toHaveCSS("transition-duration", "0.08s");
    await configure(page, { cursorSmoothCaretAnimation: "on" });
    await page.keyboard.press("l");
    await expect(caret).toHaveCSS("transition-duration", "0.08s");
  });

  test("a hard blink restarts when the caret moves, and 20 half cycles fade out at most 10 seconds", async ({
    page,
  }) => {
    await configure(page, { cursorBlinking: "smooth" });
    const shape = page.locator(".mw-caret-shape").first();
    const time = () =>
      shape.evaluate((element) =>
        Number(element.getAnimations()[0]!.currentTime),
      );
    // Under load the animation can start a little late: wait for it to run.
    await expect.poll(time).toBeGreaterThan(250);
    const before = await time();
    await page.keyboard.press("l");
    await expect
      .poll(() =>
        shape.evaluate((element) =>
          Number(element.getAnimations()[0]!.currentTime),
        ),
      )
      .toBeLessThan(before);
    const timing = await shape.evaluate((element) => {
      const effect = element.getAnimations()[0]!.effect!.getComputedTiming();
      return [effect.duration, effect.iterations, effect.direction];
    });
    expect(timing).toEqual([500, 20, "alternate"]);
  });
});
