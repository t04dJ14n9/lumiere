import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import { open } from "./harness";
import {
  FONT_NOTE as NOTE,
  HEADING_LINE_HEIGHTS,
  HEADING_SCALES,
  gutterOffsets,
  sizes,
} from "../support/font-metrics";

async function setSize(page: Page, fontSize: number, lineHeight = 1.5) {
  await page.evaluate((value) => window.harness.configureEditor(value), {
    fontSize,
    lineHeight,
  });
  // CodeMirror measures the lines again on the next frame.
  await page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      ),
  );
}

async function openNote(page: Page) {
  await open(page, NOTE);
  // The caret at the end keeps every heading and the table rendered.
  await page.evaluate((end) => window.harness.reveal(end), NOTE.length);
  await expect(page.locator(".md-h6")).toBeVisible();
}

test("the default body size is Obsidian's 16px and everything else is relative to it", async ({
  page,
}) => {
  await openNote(page);
  const measured = await sizes(page);
  expect(measured.body).toBe(16);
  measured.headings.forEach((size, index) => {
    expect(size, `H${index + 1}`).toBeCloseTo(16 * HEADING_SCALES[index]!, 2);
  });
  expect(measured.inlineCode).toBe(16);
  expect(measured.codeLine).toBe(16);
  expect(measured.tableCell).toBe(16);
  expect(measured.properties).toBe(16);
  expect(measured.footnoteRef).toBeCloseTo(16 * 0.7, 2);
  // The small code-block controls were fixed px sizes before they became em.
  expect(measured.copyCode).toBeCloseTo(16 * 0.6875, 2);
  expect(measured.codeLanguage).toBeCloseTo(16 * 0.6875, 2);
  expect(measured.footnoteDefinition).toBeCloseTo(16 * 0.875, 2);
  // Obsidian keeps the gutter at its 12px UI size at every note size.
  expect(measured.lineNumber).toBe(12);
  // Obsidian's line heights: 1.5 for the body (24px) and code, each heading's own.
  expect(measured.bodyLineHeight).toBe(24);
  expect(measured.codeLineHeight).toBe(24);
  measured.headingLineHeights.forEach((height, index) => {
    expect(height, `H${index + 1} line height`).toBeCloseTo(
      measured.headings[index]! * HEADING_LINE_HEIGHTS[index]!,
      2,
    );
  });
});

for (const size of [8, 12, 20, 32, 48]) {
  test(`fontSize ${size} rescales the body, headings, tables, code, properties, footnotes and line numbers live`, async ({
    page,
  }) => {
    await openNote(page);
    const before = await page.evaluate(() => {
      (window as unknown as { marker: number }).marker = 1;
      return document.querySelector(".cm-content") !== null;
    });
    expect(before).toBe(true);
    await setSize(page, size);
    // No reload: the page is the same document and the same editor.
    expect(
      await page.evaluate(
        () => (window as unknown as { marker?: number }).marker,
      ),
    ).toBe(1);
    const measured = await sizes(page);
    expect(measured.body).toBe(size);
    measured.headings.forEach((heading, index) => {
      expect(heading / measured.body, `H${index + 1} ratio`).toBeCloseTo(
        HEADING_SCALES[index]!,
        2,
      );
    });
    expect(measured.inlineCode).toBe(size);
    expect(measured.codeLine).toBe(size);
    expect(measured.tableCell).toBe(size);
    expect(measured.properties).toBe(size);
    expect(measured.footnoteRef / size).toBeCloseTo(0.7, 2);
    expect(measured.copyCode / size).toBeCloseTo(0.6875, 2);
    expect(measured.codeLanguage / size).toBeCloseTo(0.6875, 2);
    expect(measured.footnoteDefinition / size).toBeCloseTo(0.875, 2);
    // Obsidian keeps the gutter at its 12px UI size whatever the note size.
    expect(measured.lineNumber).toBe(12);
    // The lines scale with the size: 1.5 times it, and headings' own ratios.
    expect(measured.bodyLineHeight).toBeCloseTo(size * 1.5, 2);
    expect(measured.codeLineHeight).toBeCloseTo(size * 1.5, 2);
    measured.headingLineHeights.forEach((height, index) => {
      expect(height / measured.headings[index]!, `H${index + 1}`).toBeCloseTo(
        HEADING_LINE_HEIGHTS[index]!,
        2,
      );
    });
  });
}

test("lineHeight is a multiple of the size, live, and out-of-range values fall back to 1.5", async ({
  page,
}) => {
  await openNote(page);
  for (const [size, multiple] of [
    [16, 2],
    [20, 1.2],
    [12, 3],
    [16, 1],
  ] as const) {
    await setSize(page, size, multiple);
    const measured = await sizes(page);
    expect(measured.bodyLineHeight, `${size} x ${multiple}`).toBeCloseTo(
      size * multiple,
      2,
    );
    expect(measured.codeLineHeight, `${size} x ${multiple} code`).toBeCloseTo(
      size * multiple,
      2,
    );
  }
  await setSize(page, 16, 2);
  await setSize(page, 16, 30);
  expect((await sizes(page)).bodyLineHeight).toBe(24);
});

test("a size outside 8 to 48 falls back to the default like any invalid setting", async ({
  page,
}) => {
  await openNote(page);
  await setSize(page, 20);
  await setSize(page, 100);
  expect((await sizes(page)).body).toBe(16);
  await setSize(page, 20);
  await setSize(page, 3);
  expect((await sizes(page)).body).toBe(16);
});

test("line numbers stay level with their lines, headings, code, table and properties included, after each size change", async ({
  page,
}) => {
  await openNote(page);
  for (const [size, multiple] of [
    [12, 1.5],
    [20, 1.5],
    [16, 1.5],
    [14, 2],
    [48, 1.2],
    [8, 3],
    [16, 1],
    [16, 1.5],
  ] as const) {
    await setSize(page, size, multiple);
    const rows = await gutterOffsets(page);
    const numbers = await page.evaluate(() =>
      [
        ...document.querySelectorAll<HTMLElement>(
          ".cm-lineNumbers .cm-gutterElement",
        ),
      ]
        .filter((element) => element.offsetHeight > 0)
        .map((element) => element.textContent)
        .join(""),
    );
    // Properties has no number; the body starts at source line 5 and
    // rendered blocks retain their first source line number.
    const lineCount = NOTE.split("\n").length;
    expect(numbers.startsWith("5"), `${size}px x ${multiple} first`).toBe(true);
    expect(
      numbers.endsWith(String(lineCount)),
      `${size}px x ${multiple} last`,
    ).toBe(true);
    for (const row of rows) {
      expect(
        Math.abs(row.top),
        `${size}px x ${multiple} line ${row.number} top`,
      ).toBeLessThan(1);
      expect(
        Math.abs(row.height),
        `${size}px x ${multiple} line ${row.number} height`,
      ).toBeLessThan(1);
      // The digits sit level with the line's text (headings included); glyph
      // boxes overflow a very tight line, so the tightest lines get leeway.
      expect(
        Math.abs(row.textOffset ?? 0),
        `${size}px x ${multiple} line ${row.number} text`,
      ).toBeLessThan(multiple < 1.25 ? 2.5 : 1.5);
    }
  }
});
