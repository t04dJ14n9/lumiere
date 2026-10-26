/**
 * A block that starts above the view and ends inside it (a diagram drawn
 * shorter than its reserve, an image loading, a formula typeset) changes
 * height: the text the reader sees below it must stay where it is.
 * CodeMirror alone keeps that block's top still, which is off screen, and
 * moves everything below it.
 */
import { expect, test, type Page } from "@playwright/test";
import { open } from "./harness";

function filler(count: number, label: string): string {
  return Array.from(
    { length: count },
    (_, index) => `${label} paragraph ${index} is text the reader can see.`,
  ).join("\n\n");
}

const NOTE = `# Straddling\n\n${filler(30, "Before")}\n\n<div id="grow" style="height: 900px"></div>\n\n${filler(40, "After")}\n`;

async function constrain(page: Page): Promise<void> {
  await page.addStyleTag({
    content:
      "#app, #app .cm-editor, #app .cm-scroller { height: 640px !important; max-height: 640px !important; } #app .cm-scroller { overflow: auto !important; }",
  });
  await page.evaluate(() => window.dispatchEvent(new Event("resize")));
}

const frames = (page: Page, count = 3) =>
  page.evaluate(async (count) => {
    for (let frame = 0; frame < count; frame++) {
      await new Promise((resolve) => requestAnimationFrame(resolve));
    }
  }, count);

/** Where "After paragraph 0" sits, from the scroller's top. */
const textBelow = (page: Page) =>
  page.evaluate(() => {
    const scroller = document.querySelector(".cm-scroller")!;
    const line = [...document.querySelectorAll(".cm-content > .cm-line")].find(
      (element) => element.textContent?.startsWith("After paragraph 0"),
    );
    return line
      ? line.getBoundingClientRect().top - scroller.getBoundingClientRect().top
      : NaN;
  });

for (const [change, height] of [
  ["shrinks", "500px"],
  ["grows", "1200px"],
] as const) {
  test(`text below a block straddling the top edge stays still as the block ${change}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1100, height: 760 });
    await open(page, NOTE, "obsidian", { trusted: true });
    await constrain(page);
    await page.evaluate(
      (at) => window.harness.reveal(at),
      NOTE.indexOf("After paragraph 3"),
    );
    await expect(page.locator("#grow")).toBeAttached();
    // Scroll so the block starts 600 px above the view and ends inside it.
    await page.evaluate(() => {
      const scroller = document.querySelector(".cm-scroller")!;
      const block = document.querySelector("#grow")!.closest(".hybrid-block")!;
      scroller.scrollTop +=
        block.getBoundingClientRect().top -
        scroller.getBoundingClientRect().top +
        600;
    });
    await frames(page);
    const before = await textBelow(page);
    expect(before).toBeGreaterThan(0);
    expect(before).toBeLessThan(640);

    await page.evaluate((height) => {
      document.querySelector<HTMLElement>("#grow")!.style.height = height;
    }, height);
    await frames(page, 6);
    expect(Math.abs((await textBelow(page)) - before)).toBeLessThanOrEqual(2);
  });
}
