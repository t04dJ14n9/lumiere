import { test, expect } from "@playwright/test";
import { open } from "./harness";

for (const vim of [false, true]) {
  test(`a selected table row keeps vertical note scrolling and horizontal table scrolling (vim=${vim})`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 900, height: 600 });
    const columns = Array.from({ length: 20 }, (_, index) => `Column ${index}`);
    const before = Array.from(
      { length: 30 },
      (_, index) => `Before ${index}`,
    ).join("\n\n");
    const after = Array.from(
      { length: 30 },
      (_, index) => `After ${index}`,
    ).join("\n\n");
    const header = `| ${columns.join(" | ")} |`;
    const rule = `| ${columns.map(() => "---").join(" | ")} |`;
    const rows = Array.from(
      { length: 40 },
      (_, row) =>
        `| ${columns.map((_, column) => `R${row}C${column}`).join(" | ")} |`,
    ).join("\n");
    const source = `${before}\n\n${header}\n${rule}\n${rows}\n\n${after}`;
    await open(page, source, "obsidian", {
      features: { vim: { enabled: vim, config: {} } },
    });
    // Match the constrained editor height of a webview, so the note owns Y.
    await page.addStyleTag({
      content:
        ".panel { height: 100%; min-height: 0; display: flex; flex-direction: column; }",
    });
    // Reveal the table into the CodeMirror viewport so the widget mounts.
    await page.evaluate(
      (from) => window.harness.reveal(from),
      source.indexOf(header),
    );
    const note = page.locator(".cm-scroller").first();
    const table = page.locator(".hybrid-table");
    await expect(table).toHaveCount(1);
    const horizontal = table.locator(".table-scroll");
    const cell = table.locator('td[data-row="15"][data-column="0"]');
    await cell.scrollIntoViewIfNeeded();
    await table.locator('.table-row-handle[data-index="15"]').click();
    await expect(table).toBeFocused();
    await expect(table.locator(".table-cell-selected")).toHaveCount(20);
    await expect(table.locator(".cm-editor")).toHaveCount(0);
    await cell.hover();

    const beforeScroll = await note.evaluate((element) => element.scrollTop);
    expect(beforeScroll).toBeGreaterThan(300);
    await page.mouse.wheel(0, -160);
    await expect
      .poll(() => note.evaluate((element) => element.scrollTop))
      .toBe(beforeScroll - 160);
    const above = await note.evaluate((element) => element.scrollTop);
    await page.mouse.wheel(0, 160);
    await expect
      .poll(() => note.evaluate((element) => element.scrollTop))
      .toBe(above + 160);
    await expect(table.locator(".table-cell-selected")).toHaveCount(20);
    await expect(table).toBeFocused();
    expect(await horizontal.evaluate((element) => element.scrollLeft)).toBe(0);

    const vertical = await note.evaluate((element) => element.scrollTop);
    await page.mouse.wheel(180, 0);
    await expect
      .poll(() => horizontal.evaluate((element) => element.scrollLeft))
      .toBeGreaterThan(80);
    expect(await note.evaluate((element) => element.scrollTop)).toBe(vertical);

    const left = await horizontal.evaluate((element) => element.scrollLeft);
    await page.keyboard.down("Shift");
    await page.mouse.wheel(0, 180);
    await page.keyboard.up("Shift");
    await expect
      .poll(() => horizontal.evaluate((element) => element.scrollLeft))
      .toBeGreaterThan(left + 80);
    expect(await note.evaluate((element) => element.scrollTop)).toBe(vertical);
    await expect(table.locator(".table-cell-selected")).toHaveCount(20);
    expect(await page.evaluate(() => window.harness.text)).toBe(source);
  });
}
