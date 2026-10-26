/**
 * BH-016: tall wide tables keep a sticky horizontal scrollbar while the
 * native bar is below the note viewport; dragging its thumb pans `.table-scroll`.
 */
import { test, expect, type Page } from "@playwright/test";
import { open } from "./harness";

function tallWideTable(width = 20): string {
  const columns = Array.from(
    { length: width },
    (_, i) => `Column ${i} long header`,
  );
  const header = `| ${columns.join(" | ")} |`;
  const rule = `| ${columns.map(() => "---").join(" | ")} |`;
  const rows = Array.from(
    { length: 50 },
    (_, row) =>
      `| ${columns.map((_, column) => `R${row}C${column} cell text`).join(" | ")} |`,
  ).join("\n");
  const before = Array.from({ length: 8 }, (_, i) => `Before ${i}`).join(
    "\n\n",
  );
  const after = Array.from({ length: 8 }, (_, i) => `After ${i}`).join("\n\n");
  return `${before}\n\n${header}\n${rule}\n${rows}\n\n${after}`;
}

/** Distance from the bar's bottom edge to the bottom of the note scrollport. */
function gapBelowBar(page: Page): Promise<number> {
  return page.evaluate(() => {
    const note = document.querySelector(".cm-scroller")!;
    const bar = document.querySelector(".table-hscroll-sticky")!;
    const noteBottom = note.getBoundingClientRect().top + note.clientHeight;
    return Math.abs(noteBottom - bar.getBoundingClientRect().bottom);
  });
}

test("sticky hscroll appears at the top of a tall wide table and pans columns", async ({
  page,
}) => {
  await page.setViewportSize({ width: 900, height: 600 });
  const source = tallWideTable();
  await open(page, source, "obsidian", {});
  await page.addStyleTag({
    content:
      ".panel { height: 100%; min-height: 0; display: flex; flex-direction: column; }",
  });
  await page.evaluate(
    (from) => window.harness.reveal(from),
    source.indexOf("| Column 0"),
  );
  const table = page.locator(".hybrid-table");
  await expect(table).toHaveCount(1);
  const scroll = table.locator(".table-scroll");
  const sticky = table.locator(".table-hscroll-sticky");
  const thumb = sticky.locator(".table-hscroll-thumb");

  await table
    .locator('th[data-row="0"][data-column="0"]')
    .scrollIntoViewIfNeeded();
  await expect
    .poll(async () => sticky.evaluate((el) => !(el as HTMLElement).hidden))
    .toBe(true);
  await expect(thumb).toBeVisible();
  expect(await gapBelowBar(page)).toBeLessThan(1);
  // The bar rides the note's bottom edge while the note scrolls.
  const note = page.locator(".cm-scroller").first();
  await note.evaluate((el) => {
    el.scrollTop += 300;
  });
  await expect.poll(() => gapBelowBar(page)).toBeLessThan(1);
  await note.evaluate((el) => {
    el.scrollTop -= 300;
  });
  await expect.poll(() => gapBelowBar(page)).toBeLessThan(1);

  const before = await scroll.evaluate((el) => el.scrollLeft);
  const box = (await thumb.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 180, box.y + box.height / 2, {
    steps: 10,
  });
  await page.mouse.up();
  await expect
    .poll(() => scroll.evaluate((el) => el.scrollLeft))
    .toBeGreaterThan(before + 100);

  await table
    .locator('td[data-row="49"][data-column="0"]')
    .scrollIntoViewIfNeeded();
  await expect
    .poll(async () => sticky.evaluate((el) => (el as HTMLElement).hidden))
    .toBe(true);

  const kept = await scroll.evaluate((el) => el.scrollLeft);
  await table
    .locator('th[data-row="0"][data-column="0"]')
    .scrollIntoViewIfNeeded();
  await expect
    .poll(async () => sticky.evaluate((el) => !(el as HTMLElement).hidden))
    .toBe(true);
  expect(await scroll.evaluate((el) => el.scrollLeft)).toBe(kept);
});

test("the sticky bar follows whether the table overflows its column", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1600, height: 600 });
  const source = tallWideTable(4);
  await open(page, source, "obsidian", {});
  await page.addStyleTag({
    content:
      ".panel { height: 100%; min-height: 0; display: flex; flex-direction: column; }",
  });
  await page.evaluate(
    (from) => window.harness.reveal(from),
    source.indexOf("| Column 0"),
  );
  const table = page.locator(".hybrid-table");
  const scroll = table.locator(".table-scroll");
  const sticky = table.locator(".table-hscroll-sticky");
  await table
    .locator('th[data-row="0"][data-column="0"]')
    .scrollIntoViewIfNeeded();
  const height = await table.evaluate((el) => (el as HTMLElement).offsetHeight);
  expect(await scroll.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(
    true,
  );
  await expect(sticky).toBeHidden();

  // A narrower note makes the same table overflow without any note scroll.
  await page.setViewportSize({ width: 500, height: 600 });
  await expect
    .poll(() => scroll.evaluate((el) => el.scrollWidth > el.clientWidth))
    .toBe(true);
  await expect(sticky).toBeVisible();
  await expect.poll(() => gapBelowBar(page)).toBeLessThan(1);
  // The bar and its foot take no room in the table.
  expect(await table.evaluate((el) => (el as HTMLElement).offsetHeight)).toBe(
    height,
  );

  await page.setViewportSize({ width: 1600, height: 600 });
  await expect(sticky).toBeHidden();
});
