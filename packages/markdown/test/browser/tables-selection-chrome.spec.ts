import { expect, test, type Page } from "@playwright/test";
import { open } from "./harness";

const TABLE = `| A | B | C |
| --- | --- | --- |
| one | two | three |
| four | five | six |
`;

async function selectionChrome(page: Page) {
  return page
    .locator(".table-cell-selected")
    .first()
    .evaluate((el) => {
      const style = getComputedStyle(el);
      return {
        background: style.backgroundColor,
        boxShadow: style.boxShadow,
        aria: el.getAttribute("aria-selected"),
      };
    });
}

test("clicking a cell shows selection chrome on the active editor cell", async ({
  page,
}) => {
  await open(page, TABLE);
  await page.evaluate(() => {
    document.body.classList.add("vscode-dark");
    const style = document.documentElement.style;
    style.setProperty("--vscode-editor-background", "#1e1e1e");
    style.setProperty("--vscode-editor-selectionBackground", "#264f78");
    style.setProperty("--vscode-textLink-foreground", "#3794ff");
  });
  const table = page.locator(".hybrid-table");
  await table.locator('td[data-row="1"][data-column="1"]').click();
  await expect(table.locator(".cm-editor")).toHaveCount(1);
  await expect(table.locator(".table-cell-selected")).toHaveCount(1);
  await expect(table.locator('td[data-row="1"][data-column="1"]')).toHaveClass(
    /table-cell-selected/,
  );
  const chrome = await selectionChrome(page);
  expect(chrome.aria).toBe("true");
  expect(chrome.background).toBe("rgb(38, 79, 120)");
  expect(chrome.boxShadow).toContain("rgb(55, 148, 255)");
  expect(chrome.boxShadow).toMatch(/inset/);
});

test("row handle selection keeps a visible inset selection box", async ({
  page,
}) => {
  await open(page, TABLE);
  await page.evaluate(() => {
    document.body.classList.add("vscode-dark");
    const style = document.documentElement.style;
    style.setProperty("--vscode-editor-selectionBackground", "#264f78");
    style.setProperty("--vscode-textLink-foreground", "#3794ff");
  });
  const table = page.locator(".hybrid-table");
  // Grips take the pointer only while the table is hovered.
  await table.hover();
  await table.locator('.table-row-handle[data-index="1"]').click();
  await expect(table.locator(".table-cell-selected")).toHaveCount(3);
  await expect(table.locator(".cm-editor")).toHaveCount(0);
  const chrome = await selectionChrome(page);
  expect(chrome.background).toBe("rgb(38, 79, 120)");
  expect(chrome.boxShadow).toContain("rgb(55, 148, 255)");
  expect(chrome.boxShadow).toMatch(/inset/);
});
