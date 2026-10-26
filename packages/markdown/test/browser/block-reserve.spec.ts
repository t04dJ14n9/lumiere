/**
 * A rendered block holds a reserved height (min-height, from its estimate)
 * until its content is in, so the note doesn't shrink and grow under the
 * reader. Once the content is in, the reserve must go: a reserve left behind
 * is a gap under the block, and the gap is then remembered as its height.
 */
import { expect, test, type Page } from "@playwright/test";
import { open } from "./harness";

function filler(count: number, label: string): string {
  return Array.from(
    { length: count },
    (_, index) => `${label} paragraph ${index} moves the next block away.`,
  ).join("\n\n");
}

async function constrain(page: Page): Promise<void> {
  await page.addStyleTag({
    content:
      "#app, #app .cm-editor, #app .cm-scroller { height: 640px !important; max-height: 640px !important; } #app .cm-scroller { overflow: auto !important; }",
  });
  await page.evaluate(() => window.dispatchEvent(new Event("resize")));
}

const frames = (page: Page) =>
  page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      ),
  );

/** Each mounted block holding `selector`: its reserve and the gap under it. */
function blocksHolding(page: Page, selector: string) {
  return page.evaluate((selector) => {
    return [...document.querySelectorAll<HTMLElement>(".hybrid-block")]
      .filter((shell) => shell.querySelector(selector))
      .map((shell) => {
        const body = shell.lastElementChild as HTMLElement;
        return {
          minHeight: shell.style.minHeight,
          gap:
            shell.getBoundingClientRect().height -
            body.getBoundingClientRect().height,
        };
      });
  }, selector);
}

test("a short formula mounted after the first keeps no reserve under it", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1100, height: 760 });
  const source = `# Formulas\n\n$$a + b$$\n\n${filler(80, "Middle")}\n\n$$c + d$$\n\n${filler(20, "End")}\n`;
  await open(page, source);
  await constrain(page);
  // The first formula loads the typesetter; the second renders at once.
  await expect(page.locator("mjx-container").first()).toBeVisible();
  // Put the caret after the formula: a caret inside shows its source.
  await page.evaluate(
    (at) => window.harness.reveal(at),
    source.indexOf("End paragraph 0"),
  );
  await frames(page);
  await page.waitForTimeout(300);
  await frames(page);

  await expect(page.locator("mjx-container")).not.toHaveCount(0);
  const blocks = await blocksHolding(page, "mjx-container");
  expect(blocks.length, JSON.stringify(blocks)).toBeGreaterThan(0);
  for (const block of blocks) {
    expect(block.minHeight, JSON.stringify(blocks)).toBe("");
    expect(block.gap, JSON.stringify(blocks)).toBeLessThan(4);
  }
});
