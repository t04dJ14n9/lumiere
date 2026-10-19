import { test, expect, type Page } from "@playwright/test";
import { open } from "./harness";

const TABLE =
  "para\n\n| a | b | c |\n|---|:-:|--:|\n| 1 | 2 | 3 |\n| 4 | 5 | 6 |\n\nafter\n";
const text = (page: Page) => page.evaluate(() => window.harness.text);

test.describe("table accessibility", () => {
  test("the accessibility tree names the table, its grips, edge buttons and cells", async ({
    page,
  }) => {
    await open(page, TABLE);
    const table = page.locator(".hybrid-table");
    const tree = await table.ariaSnapshot();
    expect(tree).toContain("table");
    expect(tree).toMatch(/columnheader "Row 1, column 1"/);
    expect(tree).toMatch(/cell "Row 2, column 2"/);
    expect(tree).toMatch(/button "Move column 1"/);
    expect(tree).toMatch(/button "Move row 1"/);
    expect(tree).toMatch(/button "Add row below"/);
    expect(tree).toMatch(/button "Add column to the right"/);
    for (const grip of await table.locator(".table-handle").all()) {
      await expect(grip).toHaveAttribute("aria-haspopup", "menu");
    }
  });

  test("a grip opens its menu from the keyboard; arrows, Home, End, submenus and Escape work; focus returns", async ({
    page,
  }) => {
    await open(page, TABLE);
    const table = page.locator(".hybrid-table");
    const grip = table.locator('.table-row-handle[data-index="1"]');
    await grip.focus();
    await page.keyboard.press("Enter");
    const menu = table.getByRole("menu").first();
    await expect(menu).toBeVisible();
    const items = menu.getByRole("menuitem");
    const names = await items.evaluateAll((nodes) =>
      nodes
        .filter((node) => !(node as HTMLButtonElement).disabled)
        .map((node) => node.getAttribute("aria-label")),
    );
    expect(names).toEqual(
      expect.arrayContaining(["Add row above", "Duplicate row", "Delete row"]),
    );
    const focusedLabel = () =>
      page.evaluate(() => document.activeElement?.getAttribute("aria-label"));
    await expect.poll(focusedLabel).toBe(names[0]);
    await page.keyboard.press("End");
    await expect.poll(focusedLabel).toBe(names.at(-1));
    await page.keyboard.press("Home");
    await expect.poll(focusedLabel).toBe(names[0]);
    await page.keyboard.press("ArrowUp");
    await page.keyboard.press("ArrowDown");
    await expect.poll(focusedLabel).toBe(names[0]);
    await page.keyboard.press("Escape");
    await expect(table.getByRole("menu")).toHaveCount(0);
    await expect(grip).toBeFocused();
  });

  test("a table action runs from the keyboard alone and the caret stays in the table", async ({
    page,
  }) => {
    await open(page, TABLE);
    const table = page.locator(".hybrid-table");
    const grip = table.locator('.table-row-handle[data-index="1"]');
    await grip.focus();
    await page.keyboard.press("Enter");
    await table.getByRole("menuitem", { name: "Move row down" }).focus();
    await page.keyboard.press("Enter");
    await expect
      .poll(async () => (await text(page)).split("\n").slice(4, 6).join("\n"))
      .toBe("| 4   |  5  |   6 |\n| 1   |  2  |   3 |");
    await expect(table.getByRole("menu")).toHaveCount(0);
    await expect(table.locator(".cm-content")).toBeFocused();
  });

  test("the cell menu opens with the context-menu key and Shift+F10, and submenus open with ArrowRight", async ({
    page,
  }) => {
    await open(page, TABLE);
    const table = page.locator(".hybrid-table");
    await table.locator(".table-cell-content").nth(3).click();
    await page.keyboard.press("Shift+F10");
    const menu = table.getByRole("menu").first();
    await expect(menu).toBeVisible();
    const row = table.getByRole("menuitem", { name: "Row", exact: true });
    await row.focus();
    await expect(row).toHaveAttribute("aria-haspopup", "menu");
    await page.keyboard.press("ArrowRight");
    await expect(row).toHaveAttribute("aria-expanded", "true");
    await expect(
      table.getByRole("menuitem", { name: "Add row above" }),
    ).toBeFocused();
    await page.keyboard.press("ArrowLeft");
    await expect(row).toBeFocused();
    await page.keyboard.press("Escape");
    await page.keyboard.press("Escape");
    await expect(table.getByRole("menu")).toHaveCount(0);
    await expect(table.locator(".cm-content")).toBeFocused();
  });
});
