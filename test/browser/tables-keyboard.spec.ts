import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import { open } from "./harness";
import { parseTable } from "../../src/markdown/tables/model";

const TABLE = "para\n\n| abcdef | z |\n|---|---|\n| next | last |\n\nafter\n";

test.beforeEach(async ({ page }) => {
  await open(page, TABLE, "obsidian", {
    features: { vim: { enabled: false, config: {} } },
  });
});

async function selectHeaderCells(page: Page): Promise<void> {
  await page.locator(".hybrid-table .table-cell-content").first().click();
  await expect(
    page.getByRole("textbox", { name: "Table cell 1, 1", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("End");
  await page.keyboard.press("Shift+ArrowRight");
  await expect(page.locator(".table-cell-selected")).toHaveCount(2);
}

async function cellTexts(page: Page): Promise<string[][] | undefined> {
  const source = await page.evaluate(() => window.harness.text);
  return parseTable(source.split("\n").slice(2, 5).join("\n"))?.rows.map(
    (row) => row.map((cell) => cell.text),
  );
}

test("forward collapse resets the saved caret before extending back to a shorter cell", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") {
      errors.push(message.text());
    }
  });
  await selectHeaderCells(page);
  await page.keyboard.press("ArrowRight");
  await expect(page.locator(".table-cell-selected")).toHaveCount(1);
  await expect(
    page.locator(".table-cell-selected .table-cell-content"),
  ).toHaveText("z");
  await page.keyboard.press("Shift+ArrowLeft");
  await expect(page.locator(".table-cell-selected")).toHaveCount(2);
  await page.keyboard.press("Shift+ArrowRight");
  await expect(
    page.getByRole("textbox", { name: "Table cell 1, 2", exact: true }),
  ).toBeFocused();
  await page.keyboard.type("x");
  await expect
    .poll(() => cellTexts(page))
    .toEqual([
      ["abcdef", "zx"],
      ["next", "last"],
    ]);
  expect(errors).toEqual([]);
});

test("typing after backward grid collapse inserts the initiating character", async ({
  page,
}) => {
  await selectHeaderCells(page);
  await page.keyboard.press("ArrowLeft");
  await expect(page.locator(".table-cell-selected")).toHaveCount(1);
  await page.keyboard.type("x");
  await expect(
    page.getByRole("textbox", { name: "Table cell 1, 1", exact: true }),
  ).toBeFocused();
  await expect
    .poll(() => cellTexts(page))
    .toEqual([
      ["xabcdef", "z"],
      ["next", "last"],
    ]);
});

test("Enter after backward grid collapse reaches the cell navigation keymap", async ({
  page,
}) => {
  await selectHeaderCells(page);
  await page.keyboard.press("ArrowLeft");
  await expect(page.locator(".table-cell-selected")).toHaveCount(1);
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("textbox", { name: "Table cell 2, 1", exact: true }),
  ).toBeFocused();
  expect(await page.evaluate(() => window.harness.text)).toBe(TABLE);
  await page.keyboard.type("x");
  await expect
    .poll(() => cellTexts(page))
    .toEqual([
      ["abcdef", "z"],
      ["x", "last"],
    ]);
});
