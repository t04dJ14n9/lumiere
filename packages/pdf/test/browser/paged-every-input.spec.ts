import { expect, test, type Page } from "@playwright/test";
import { openView, pageIndexes } from "./view-controls-support";

// Page-by-page mode: every way of going forward or back turns the page (the
// spread, in two-page layouts), and a page zoomed beyond the viewer is panned to
// its edge first.

const shown = async (page: Page): Promise<string> => (await pageIndexes(page)).join();

async function settled(page: Page): Promise<void> {
  await page.waitForTimeout(250);
  await page.evaluate(async () => {
    await new Promise(requestAnimationFrame);
    await new Promise(requestAnimationFrame);
  });
}

async function hover(page: Page): Promise<void> {
  const box = (await page.locator(".viewport").boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
}

/** A trackpad swipe: ramping deltas, then momentum, sent as one stream. */
async function swipe(page: Page, sign: 1 | -1): Promise<void> {
  const deltas = [10, 25, 50, 80, 120, 110, 90, 70, 50, 35, 25, 15, 8, 4, 2];
  for (const delta of deltas) await page.mouse.wheel(0, sign * delta);
}

type Input = {
  name: string;
  forward: (page: Page) => Promise<void>;
  back: (page: Page) => Promise<void>;
};

const inputs: Input[] = [
  ...["ArrowRight/ArrowLeft", "ArrowDown/ArrowUp", "PageDown/PageUp"].map((pair) => {
    const [next, previous] = pair.split("/") as [string, string];
    return {
      name: pair,
      forward: (page: Page) => page.keyboard.press(next),
      back: (page: Page) => page.keyboard.press(previous),
    };
  }),
  {
    name: "mouse wheel notches",
    forward: async (page) => {
      await hover(page);
      for (let i = 0; i < 4; i++) await page.mouse.wheel(0, 100);
    },
    back: async (page) => {
      await hover(page);
      for (let i = 0; i < 4; i++) await page.mouse.wheel(0, -100);
    },
  },
  {
    name: "trackpad swipe",
    forward: async (page) => {
      await hover(page);
      await swipe(page, 1);
    },
    back: async (page) => {
      await hover(page);
      await swipe(page, -1);
    },
  },
  {
    name: "next/previous buttons",
    forward: (page) => page.getByRole("button", { name: "Next page" }).click(),
    back: (page) => page.getByRole("button", { name: "Previous page" }).click(),
  },
];

for (const pageLayout of ["single", "spread", "spreadCover"] as const) {
  for (const input of inputs) {
    test(`paged ${pageLayout}, fit page: ${input.name} turns the page forward and back`, async ({ page }) => {
      await page.setViewportSize({ width: 1000, height: 700 });
      await openView(page, { defaultZoom: "fitPage", scrollMode: "paged", pageLayout, smoothScrolling: true });
      await settled(page);
      const first = await shown(page);
      // From the first page or spread, forward goes on once, whatever the input.
      await input.forward(page);
      await settled(page);
      const second = await shown(page);
      expect(second).not.toBe(first);
      expect(Math.min(...second.split(",").map(Number))).toBeGreaterThan(
        Math.min(...first.split(",").map(Number)),
      );
      // Momentum has ended: the view has not run on to a third page or spread.
      await settled(page);
      expect(await shown(page)).toBe(second);
      await input.back(page);
      await settled(page);
      expect(await shown(page)).toBe(first);
    });
  }
}

for (const key of ["ArrowRight", "ArrowDown", "PageDown"]) {
  test(`paged and zoomed: ${key} pans to the edge of the page, then turns it`, async ({ page }) => {
    await page.setViewportSize({ width: 800, height: 600 });
    await openView(page, { defaultZoom: 300, scrollMode: "paged", pageLayout: "single" });
    await settled(page);
    const viewport = page.locator(".viewport");
    const position = () => viewport.evaluate((v) => v.scrollLeft + v.scrollTop);
    const start = await shown(page);
    const before = await position();
    await page.keyboard.press(key);
    await settled(page);
    // The first press pans (the page is larger than the viewer) and does not turn.
    expect(await shown(page)).toBe(start);
    expect(await position()).toBeGreaterThan(before);
    // Pressing on reaches the edge and then turns the page.
    for (let i = 0; i < 80 && (await shown(page)) === start; i++) {
      await page.keyboard.press(key);
      await page.waitForTimeout(30);
    }
    expect(await shown(page)).not.toBe(start);
  });
}
