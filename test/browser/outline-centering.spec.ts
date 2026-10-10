import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import { open as openNote } from "./harness";

/** Within this many pixels counts as centred: half a line of rounding either way. */
const TOLERANCE = 6;

/** Sixty sections of ten body lines, so the note is many viewports tall. */
function longNote(): { source: string; offsetOf: (title: string) => number } {
  const parts: string[] = [];
  for (let n = 1; n <= 60; n++) {
    parts.push(`## Section ${n}`, "");
    for (let line = 1; line <= 10; line++) {
      parts.push(`Body of section ${n}, line ${line}.`, "");
    }
  }
  const source = parts.join("\n");
  return {
    source,
    offsetOf: (title) => source.indexOf(`## ${title}`),
  };
}

async function geometry(page: Page, title: string) {
  return page.evaluate((title) => {
    const scroller = document.querySelector(".cm-scroller")!;
    const box = scroller.getBoundingClientRect();
    const line = [...document.querySelectorAll(".cm-line")].find(
      (candidate) => candidate.textContent?.replace(/^#+ /, "") === title,
    );
    const rect = line?.getBoundingClientRect();
    return {
      viewportCenter: box.top + box.height / 2,
      viewportTop: box.top,
      viewportBottom: box.bottom,
      headingCenter: rect ? rect.top + rect.height / 2 : undefined,
      scrollTop: scroller.scrollTop,
      maxScrollTop: scroller.scrollHeight - scroller.clientHeight,
    };
  }, title);
}

async function clickOutline(page: Page, offset: number) {
  await page.evaluate(
    (at) => window.harness.navigate({ fragment: "", at }),
    offset,
  );
}

/**
 * The harness mounts the editor in a plain block; the real webview gives it
 * the window's height. Constrain it the same way so the editor scrolls inside
 * its own viewport instead of growing to the height of the note.
 */
async function open(page: Page, source: string) {
  await openNote(page, source);
  await page.addStyleTag({
    content:
      ".panel { flex: 1; min-height: 0; display: flex; flex-direction: column; }",
  });
  await expect
    .poll(() =>
      page.evaluate(() => document.querySelector(".cm-scroller")!.clientHeight),
    )
    .toBeLessThanOrEqual(700);
}

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1000, height: 700 });
});

for (const title of ["Section 5", "Section 30", "Section 55"]) {
  test(`outline click centres "${title}" vertically in the viewport`, async ({
    page,
  }) => {
    const { source, offsetOf } = longNote();
    await open(page, source);
    await clickOutline(page, offsetOf(title));
    await expect
      .poll(async () => {
        const g = await geometry(page, title);
        return g.headingCenter === undefined
          ? Infinity
          : Math.abs(g.headingCenter - g.viewportCenter);
      })
      .toBeLessThanOrEqual(TOLERANCE);
  });
}

test("a heading already on screen is still moved to the centre", async ({
  page,
}) => {
  const { source, offsetOf } = longNote();
  await open(page, source);
  await clickOutline(page, offsetOf("Section 30"));
  await clickOutline(page, offsetOf("Section 29"));
  await expect
    .poll(async () => {
      const g = await geometry(page, "Section 29");
      return Math.abs((g.headingCenter ?? Infinity) - g.viewportCenter);
    })
    .toBeLessThanOrEqual(TOLERANCE);
  // Section 29 is a full section (about 1000px) above 30, so this is a long
  // jump; the next click goes back by a few lines only.
  await clickOutline(page, offsetOf("Section 29") + 1);
  const after = await geometry(page, "Section 29");
  expect(
    Math.abs(after.headingCenter! - after.viewportCenter),
  ).toBeLessThanOrEqual(TOLERANCE);
});

test("the first heading clamps at the top of the note", async ({ page }) => {
  const { source, offsetOf } = longNote();
  await open(page, source);
  await clickOutline(page, offsetOf("Section 30"));
  await clickOutline(page, offsetOf("Section 1"));
  await expect
    .poll(async () => (await geometry(page, "Section 1")).scrollTop)
    .toBe(0);
  const g = await geometry(page, "Section 1");
  expect(g.headingCenter!).toBeGreaterThanOrEqual(g.viewportTop);
  expect(g.headingCenter!).toBeLessThan(g.viewportCenter);
});

/** Filler paragraphs, so a note is many viewports tall. */
const FILLER = Array.from({ length: 80 }, (_, n) => `Filler ${n}.`).join(
  "\n\n",
);

test("a heading near the start clamps at the top: centring would need a negative scroll", async ({
  page,
}) => {
  const source = `# Title\n\n## Early\n\n${FILLER}\n\n## Far\n\n${FILLER}`;
  await open(page, source);
  await clickOutline(page, source.indexOf("## Far"));
  await expect
    .poll(async () => (await geometry(page, "Far")).scrollTop)
    .toBeGreaterThan(0);
  await clickOutline(page, source.indexOf("## Early"));
  await expect
    .poll(async () => (await geometry(page, "Early")).scrollTop)
    .toBe(0);
  const g = await geometry(page, "Early");
  expect(g.headingCenter!).toBeGreaterThan(g.viewportTop);
  expect(g.headingCenter!).toBeLessThan(g.viewportCenter - TOLERANCE);
});

test("a heading on the last line clamps at the bottom of the scroll range", async ({
  page,
}) => {
  const source = `# Title\n\n${FILLER}\n\n## Last`;
  await open(page, source);
  await clickOutline(page, source.indexOf("## Last"));
  await expect
    .poll(async () => {
      const g = await geometry(page, "Last");
      return Math.abs(g.scrollTop - g.maxScrollTop);
    })
    .toBeLessThanOrEqual(1);
  const g = await geometry(page, "Last");
  expect(g.scrollTop).toBeGreaterThan(0);
  expect(g.headingCenter!).toBeGreaterThan(g.viewportCenter + TOLERANCE);
  expect(g.headingCenter!).toBeLessThan(g.viewportBottom);
});

test("a heading in a note shorter than the viewport does not scroll", async ({
  page,
}) => {
  await open(page, "# One\n\ntext\n\n## Two\n\nmore\n");
  await clickOutline(page, "# One\n\ntext\n\n".length);
  const g = await geometry(page, "Two");
  expect(g.scrollTop).toBe(0);
  expect(g.maxScrollTop).toBeLessThanOrEqual(0);
});
