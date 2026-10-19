/**
 * The add-row and add-column buttons, as measured in Obsidian 1.14.4
 * (docs/obsidian-measurements/tables/button-visibility*.mjs): a 16px strip
 * directly under the table (its full width) and directly beside it (its full
 * height), invisible until the pointer is over the strip itself.
 */
import { test, expect, type Locator } from "@playwright/test";
import { open } from "./harness";

const TABLE =
  "para\n\n| a | b | c |\n|---|:-:|--:|\n| 1 | 2 | 3 |\n| 4 | 5 | 6 |\n\nafter\n";

const opacity = (button: Locator) =>
  button.evaluate((element) => getComputedStyle(element).opacity);

test.describe("add row and add column buttons", () => {
  test("both sit against the table, 16px wide, and show only under the pointer", async ({
    page,
  }) => {
    await open(page, TABLE);
    const table = page.locator(".hybrid-table");
    const grid = table.locator("table");
    const row = table.getByRole("button", { name: "Add row below" });
    const column = table.getByRole("button", {
      name: "Add column to the right",
    });
    await expect(row).toHaveCount(1);
    await expect(column).toHaveCount(1);
    const box = (await grid.boundingBox())!;
    const rowBox = (await row.boundingBox())!;
    const columnBox = (await column.boundingBox())!;
    // Below the table, as wide as it is (Obsidian: dy 90 = table height, 166 x 16).
    expect(rowBox.y).toBeGreaterThanOrEqual(box.y + box.height - 2);
    expect(rowBox.y).toBeLessThanOrEqual(box.y + box.height + 1);
    expect(rowBox.x).toBeCloseTo(box.x, 0);
    expect(rowBox.width).toBeCloseTo(box.width, 0);
    expect(rowBox.height).toBeCloseTo(16, 0);
    // Beside the table, as tall as it is (Obsidian: dx 166 = table width, 16 x 90).
    expect(columnBox.x).toBeGreaterThanOrEqual(box.x + box.width - 2);
    expect(columnBox.x).toBeLessThanOrEqual(box.x + box.width + 1);
    expect(columnBox.y).toBeCloseTo(box.y, 0);
    expect(columnBox.height).toBeCloseTo(box.height, 0);
    expect(columnBox.width).toBeCloseTo(16, 0);

    // At rest, and with the pointer over the table, both are invisible.
    await page.mouse.move(5, 5);
    expect(await opacity(row)).toBe("0");
    expect(await opacity(column)).toBe("0");
    await page.mouse.move(box.x + box.width / 2, box.y + 5);
    expect(await opacity(row)).toBe("0");
    expect(await opacity(column)).toBe("0");

    // Over the strip itself, only that button shows.
    await page.mouse.move(
      rowBox.x + rowBox.width / 2,
      rowBox.y + rowBox.height / 2,
    );
    await expect.poll(() => opacity(row)).toBe("1");
    expect(await opacity(column)).toBe("0");
    await expect(row).toHaveText("+");
    await page.mouse.move(
      columnBox.x + columnBox.width / 2,
      columnBox.y + columnBox.height / 2,
    );
    await expect.poll(() => opacity(column)).toBe("1");
    await expect.poll(() => opacity(row)).toBe("0");
    await expect(column).toHaveText("+");
  });

  test("a real click on the strip below adds a row and focuses its first cell", async ({
    page,
  }) => {
    await open(page, TABLE);
    const table = page.locator(".hybrid-table");
    const row = table.getByRole("button", { name: "Add row below" });
    const strip = (await row.boundingBox())!;
    // The pointer, not a synthetic click: the strip is invisible until hovered.
    await page.mouse.move(
      strip.x + strip.width / 2,
      strip.y + strip.height / 2,
    );
    await page.mouse.down();
    await page.mouse.up();
    await expect
      .poll(() => page.evaluate(() => window.harness.text.split("\n")[6]))
      .toBe("|     |     |     |");
    await expect(table.locator(".cm-content")).toHaveAttribute(
      "aria-label",
      "Table cell 4, 1",
    );
  });

  test("a real click on the strip beside adds a column and focuses its header", async ({
    page,
  }) => {
    await open(page, TABLE);
    const table = page.locator(".hybrid-table");
    const column = table.getByRole("button", {
      name: "Add column to the right",
    });
    const strip = (await column.boundingBox())!;
    await page.mouse.move(
      strip.x + strip.width / 2,
      strip.y + strip.height / 2,
    );
    await page.mouse.down();
    await page.mouse.up();
    await expect
      .poll(() => page.evaluate(() => window.harness.text.split("\n")[2]))
      .toBe("| a   |  b  |   c |     |");
    await expect(table.locator(".cm-content")).toHaveAttribute(
      "aria-label",
      "Table cell 1, 4",
    );
  });

  test("the keyboard reaches both buttons and shows them", async ({ page }) => {
    await open(page, TABLE);
    const table = page.locator(".hybrid-table");
    const row = table.getByRole("button", { name: "Add row below" });
    const column = table.getByRole("button", {
      name: "Add column to the right",
    });
    await page.mouse.move(5, 5);
    await row.focus();
    await page.keyboard.press("Shift+Tab");
    await page.keyboard.press("Tab");
    await expect(row).toBeFocused();
    await expect.poll(() => opacity(row)).toBe("1");
    await page.keyboard.press("Tab");
    await expect(column).toBeFocused();
    await expect.poll(() => opacity(column)).toBe("1");
    await page.keyboard.press("Shift+Tab");
    await page.keyboard.press("Enter");
    await expect
      .poll(() => page.evaluate(() => window.harness.text.split("\n")[6]))
      .toBe("|     |     |     |");
  });
});
