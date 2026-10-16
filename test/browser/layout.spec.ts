import { test, expect } from "@playwright/test";
import { open } from "./harness";

test("a wide table scrolls inside its own box, not the whole note", async ({
  page,
}) => {
  const columns = Array.from({ length: 30 }, (_, index) => `C${index}`);
  const header = `| ${columns.join(" | ")} |`;
  const rule = `| ${columns.map(() => "---").join(" | ")} |`;
  const row = `| ${columns.map(() => "value").join(" | ")} |`;
  await open(page, `Text\n\n${header}\n${rule}\n${row}\n\nafter`);
  const scroll = page.locator(".hybrid-table .table-scroll");
  await expect(scroll).toHaveCount(1);
  const sizes = await scroll.evaluate((element) => ({
    inner: element.scrollWidth,
    outer: element.clientWidth,
    note: document.querySelector(".cm-scroller")!.scrollWidth,
    viewport: document.querySelector(".cm-scroller")!.clientWidth,
  }));
  expect(sizes.inner).toBeGreaterThan(sizes.outer);
  expect(sizes.note).toBeLessThanOrEqual(sizes.viewport);
});

test("nested list guides follow rendered bullet columns and the guide setting", async ({
  page,
}) => {
  await page.setViewportSize({ width: 640, height: 720 });
  const source = [
    "1. Dockerfile and build context",
    `   - Child with ${"a long description ".repeat(8)}`,
    "     - [ ] Grandchild task",
    "       - Great grandchild",
    "         continuation text",
    "",
    "After",
    "",
    "    indented code",
  ].join("\n");
  await open(page, source);
  await page.evaluate(() => window.harness.reveal(window.harness.text.length));
  const rows = page.locator(".cm-line.md-list-line");
  await expect(rows).toHaveCount(4);
  await expect(page.locator(".md-list-line.mw-indent-guide")).toHaveCount(0);
  await expect(page.locator(".mw-indent-guide")).toHaveCount(1);
  const geometry = await rows.evaluateAll((elements) =>
    elements.map((element) => {
      const style = getComputedStyle(element);
      const spacer = element.querySelector(".md-list-indent");
      const marker = element.querySelector(
        ".list-bullet, .md-list-number, input[type=checkbox]",
      )!;
      const box = element.getBoundingClientRect();
      const markerRange = document.createRange();
      if (marker.firstChild) {
        markerRange.setStart(marker.firstChild, 0);
        markerRange.setEnd(marker.firstChild, 1);
      }
      const markerBox = marker.firstChild
        ? markerRange.getBoundingClientRect()
        : marker.getBoundingClientRect();
      return {
        guideStart:
          box.left +
          parseFloat(style.backgroundPositionX) +
          Number([...style.backgroundImage.matchAll(/ ([\d.]+)px/g)][1]?.[1]),
        guideWidth: parseFloat(style.backgroundSize),
        indentWidth: spacer?.getBoundingClientRect().width ?? 0,
        markerCenter: markerBox.left + markerBox.width / 2,
        background: style.backgroundImage,
        backgroundSize: style.backgroundSize,
        spacerBackground: spacer
          ? getComputedStyle(spacer).backgroundImage
          : "none",
        height: box.height,
        lineHeight: parseFloat(style.lineHeight),
      };
    }),
  );
  for (const [index, row] of geometry.entries()) {
    expect(row.background).toContain("repeating-linear-gradient");
    expect(row.backgroundSize).toMatch(/ 100%$/);
    expect(row.spacerBackground).toBe("none");
    expect(row.guideWidth).toBeCloseTo(row.indentWidth, 1);
    if (index > 0) {
      const step = row.indentWidth / index;
      const lastGuide = row.guideStart + (index - 1) * step;
      expect(
        Math.abs(lastGuide - geometry[index - 1]!.markerCenter),
      ).toBeLessThan(4);
    }
  }
  expect(geometry[1]!.height).toBeGreaterThan(geometry[1]!.lineHeight * 2);

  await page.evaluate(() => {
    const fiber = [...window.harness.views[0]!.runtime.fibers].find(
      (value) => value.definition.name === "indentGuides",
    )!;
    fiber.context!.livePreview.setMode("source");
  });
  await expect(rows).toHaveCount(0);
  await expect(page.locator(".mw-indent-guide")).toHaveCount(5);
  await page.evaluate(() => {
    const fiber = [...window.harness.views[0]!.runtime.fibers].find(
      (value) => value.definition.name === "indentGuides",
    )!;
    fiber.context!.livePreview.setMode("livePreview");
  });
  await expect(rows).toHaveCount(4);
  await page.evaluate(async () => {
    await [...window.harness.views[0]!.runtime.fibers]
      .find((value) => value.definition.name === "indentGuides")!
      .dispose();
  });
  await expect(page.locator(".mw-indent-guides, .mw-indent-guide")).toHaveCount(
    0,
  );
  await expect(rows).toHaveCount(4);
  for (const row of await rows.all()) {
    await expect(row).toHaveCSS("background-image", "none");
  }
  for (const spacer of await page.locator(".md-list-indent").all()) {
    await expect(spacer).toHaveCSS("background-image", "none");
  }
  expect(await page.evaluate(() => window.harness.text)).toBe(source);
});
