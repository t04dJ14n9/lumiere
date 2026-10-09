import { test, expect, type Locator, type Page } from "@playwright/test";
import { open } from "./harness";

async function drag(
  page: Page,
  handle: Locator,
  target: Locator,
): Promise<void> {
  const from = await handle.boundingBox();
  const to = await target.boundingBox();
  if (!from || !to) {
    throw new Error("Table drag target is not visible");
  }
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, {
    steps: 5,
  });
  await page.mouse.up();
}

test("table DOM preserves raw focused cells, document entry, edge buttons, menus and drag grips", async ({
  page,
}) => {
  await open(
    page,
    "Before\n\n| a | b | c |\n|---|:-:|--:|\n| **bold** and *italic* | 2 | 3 |\n| 4 | 5 | 6 |\n\nAfter",
  );
  const table = page.locator(".hybrid-table");
  const cells = table.locator(".table-cell-content");
  const editor = table.locator(".cm-content");
  const rows = table.locator("tbody tr");
  const rowButton = table.getByRole("button", {
    name: "Add row below",
    exact: true,
  });
  const columnButton = table.getByRole("button", {
    name: "Add column to the right",
    exact: true,
  });
  await expect(table.locator(".table-column-handle")).toHaveCount(3);
  await expect(table.locator(".table-row-handle")).toHaveCount(3);
  await expect(table.locator('td[data-column="1"]').first()).toHaveAttribute(
    "align",
    "center",
  );
  await expect(rowButton).toHaveCSS("opacity", "0");
  await table.hover();
  await expect(columnButton).toHaveCSS("opacity", "1");
  await expect(rowButton).toHaveCSS("opacity", "0");
  await cells.nth(3).click({ position: { x: 2, y: 8 } });
  await expect(editor).toHaveText("**bold** and *italic*");
  await page.keyboard.press("End");
  await expect(editor).toHaveText("**bold** and *italic*");
  await expect(rowButton).toHaveCSS("opacity", "1");
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.type("x|y\\z");
  await expect(editor).toHaveText("x\\|y\\z");
  await page.keyboard.press("Tab");
  await expect(editor).toHaveAttribute("aria-label", "Table cell 2, 2");
  await expect(cells.nth(3)).toHaveText("x|y\\z");
  await page.keyboard.press("Enter");
  await expect(editor).toHaveAttribute("aria-label", "Table cell 3, 2");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowDown");
  await expect(editor).toHaveCount(0);
  await expect(rows).toHaveCount(2);
  await page.keyboard.press("ArrowUp");
  await expect(editor).toHaveAttribute("aria-label", "Table cell 3, 2");
  await rowButton.click();
  await expect(rows).toHaveCount(3);
  await expect(editor).toHaveAttribute("aria-label", "Table cell 4, 1");
  await table.hover();
  await columnButton.click();
  await expect(table.locator("thead th")).toHaveCount(4);
  await expect(editor).toHaveAttribute("aria-label", "Table cell 4, 4");
  await cells.nth(4).click({ button: "right" });
  await expect(
    table.getByRole("menuitem", { name: "Paste as plain text", exact: true }),
  ).toBeVisible();
  await expect(
    table.getByRole("menuitem", { name: "Select all", exact: true }),
  ).toBeVisible();
  await expect(
    table.getByRole("menuitem", { name: "Edit table source", exact: true }),
  ).toHaveCount(0);
  await table
    .getByRole("menuitem", { name: "Select all", exact: true })
    .click();
  // The right-click selected a cell, not text: Select all takes the whole grid.
  await expect(table.locator(".table-cell-selected")).toHaveCount(
    await table.locator("td, th").count(),
  );
  await cells.nth(4).click({ button: "right" });
  await page.evaluate(() => {
    window.harness.clipboard = "menu paste";
  });
  await table
    .getByRole("menuitem", { name: "Paste as plain text", exact: true })
    .click();
  await expect(table).toContainText("menu paste");
  const grip = table.locator('.table-row-handle[data-index="1"]');
  await grip.click();
  await expect(table.getByRole("menu")).toHaveCount(0);
  await drag(page, grip, rows.nth(1));
  await expect(rows.nth(1).locator("td").first()).toContainText("menu paste");
  await drag(
    page,
    table.locator('.table-column-handle[data-index="0"]'),
    table.locator("thead th").nth(2),
  );
  await expect(table.locator("thead th").nth(2)).toContainText("a");
  await page
    .getByRole("textbox", { name: "Markdown content", exact: true })
    .focus();
  await expect(editor).toHaveCount(0);
  await expect(table).not.toHaveClass(/has-focus/);
});
