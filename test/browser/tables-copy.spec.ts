import { test, expect } from "@playwright/test";
import { open } from "./harness";

const TABLE =
  "para\n\n| a | b | c |\n|---|---|---|\n| 1 | 2 | 3 |\n| 4 | 5 | 6 |\n\nafter\n";

for (const shortcut of ["Control+c", "Meta+c"]) {
  test(`${shortcut} copies a column selected through its handle`, async ({
    page,
  }) => {
    await open(page, TABLE);
    const table = page.locator(".hybrid-table");
    await table
      .locator('.table-column-handle[data-index="1"]')
      .click({ force: true });
    await expect(table.locator(".table-cell-selected")).toHaveCount(3);
    await page.keyboard.press(shortcut);
    await expect
      .poll(() => page.evaluate(() => window.harness.clipboard))
      .toBe("b\n2\n5");
    await expect(table.locator(".table-cell-selected")).toHaveCount(3);
    expect(await page.evaluate(() => window.harness.text)).toBe(TABLE);
  });
}

test("row, rectangular and single-cell grid selections copy TSV", async ({
  page,
}) => {
  await open(page, TABLE);
  const table = page.locator(".hybrid-table");
  await table
    .locator('.table-row-handle[data-index="1"]')
    .click({ force: true });
  await page.keyboard.press("Control+c");
  await expect
    .poll(() => page.evaluate(() => window.harness.clipboard))
    .toBe("1\t2\t3");
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("Shift+ArrowRight");
  await page.keyboard.press("Shift+ArrowDown");
  await page.keyboard.press("Control+c");
  await expect
    .poll(() => page.evaluate(() => window.harness.clipboard))
    .toBe("1\t2\n4\t5");
  await table
    .locator(".table-cell-content")
    .nth(3)
    .click({ modifiers: ["Shift"] });
  await page.keyboard.press("Control+c");
  await expect
    .poll(() => page.evaluate(() => window.harness.clipboard))
    .toBe("1");
  await expect(table.locator(".table-cell-selected")).toHaveCount(1);
});
