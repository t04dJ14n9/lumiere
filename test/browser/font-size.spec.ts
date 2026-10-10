import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import { open } from "./harness";
import {
  FONT_NOTE as NOTE,
  HEADING_SCALES,
  gutterOffsets,
  sizes,
} from "../support/font-metrics";

async function setSize(page: Page, fontSize: number) {
  await page.evaluate(
    (value) => window.harness.configureEditor({ fontSize: value }),
    fontSize,
  );
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
  expect(measured.footnoteDefinition).toBeCloseTo(16 * 0.875, 2);
  expect(measured.lineNumber).toBe(16);
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
    expect(measured.footnoteDefinition / size).toBeCloseTo(0.875, 2);
    expect(measured.lineNumber).toBe(size);
  });
}

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
  for (const size of [12, 20, 16, 14, 48, 8, 16]) {
    await setSize(page, size);
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
    // A rendered block (properties, table) stacks the numbers of its lines.
    const lineCount = NOTE.split("\n").length;
    expect(numbers, `${size}px`).toBe(
      Array.from({ length: lineCount }, (_, index) => index + 1).join(""),
    );
    for (const row of rows) {
      expect(
        Math.abs(row.top),
        `${size}px line ${row.number} top`,
      ).toBeLessThan(1);
      expect(
        Math.abs(row.height),
        `${size}px line ${row.number} height`,
      ).toBeLessThan(1);
      // The digits sit level with the line's text (headings included).
      expect(
        Math.abs(row.textOffset ?? 0),
        `${size}px line ${row.number} text`,
      ).toBeLessThan(1.5);
    }
  }
});
