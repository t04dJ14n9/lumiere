/**
 * BH-016: tall wide tables keep a sticky horizontal scrollbar while the
 * native bar is below the note viewport; dragging its thumb pans `.table-scroll`.
 */
import { test, expect } from "@playwright/test";
import { open } from "./harness";

function tallWideTable(): string {
  const columns = Array.from(
    { length: 20 },
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
  await expect.poll(async () => sticky.evaluate((el) => !el.hidden)).toBe(true);
  await expect(thumb).toBeVisible();

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
  await expect.poll(async () => sticky.evaluate((el) => el.hidden)).toBe(true);

  const kept = await scroll.evaluate((el) => el.scrollLeft);
  await table
    .locator('th[data-row="0"][data-column="0"]')
    .scrollIntoViewIfNeeded();
  await expect.poll(async () => sticky.evaluate((el) => !el.hidden)).toBe(true);
  expect(await scroll.evaluate((el) => el.scrollLeft)).toBe(kept);
});
