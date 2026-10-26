import { test, expect, type Page } from "@playwright/test";
import { open } from "./harness";

const columns = Array.from({ length: 20 }, (_, index) => `Column ${index}`);
const header = `| ${columns.join(" | ")} |`;

function wideTableNote(): string {
  const before = Array.from(
    { length: 30 },
    (_, index) => `Before ${index}`,
  ).join("\n\n");
  const after = Array.from({ length: 30 }, (_, index) => `After ${index}`).join(
    "\n\n",
  );
  const rule = `| ${columns.map(() => "---").join(" | ")} |`;
  const rows = Array.from(
    { length: 40 },
    (_, row) =>
      `| ${columns.map((_, column) => `R${row}C${column}`).join(" | ")} |`,
  ).join("\n");
  return `${before}\n\n${header}\n${rule}\n${rows}\n\n${after}`;
}

async function openWideTable(page: Page, source: string, vim: boolean) {
  await page.setViewportSize({ width: 900, height: 600 });
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
  const table = page.locator(".hybrid-table");
  await expect(table).toHaveCount(1);
  return {
    note: page.locator(".cm-scroller").first(),
    table,
    horizontal: table.locator(".table-scroll"),
  };
}

for (const vim of [false, true]) {
  test(`a selected table row keeps vertical note scrolling and horizontal table scrolling (vim=${vim})`, async ({
    page,
  }) => {
    const source = wideTableNote();
    const { note, table, horizontal } = await openWideTable(page, source, vim);
    const cell = table.locator('td[data-row="15"][data-column="0"]');
    await cell.scrollIntoViewIfNeeded();
    // Grips take the pointer only while the table is hovered.
    await table.hover();
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

    // Chromium turns Shift and a vertical wheel into horizontal scrolling on
    // Windows and Linux. On macOS the system does that for a real mouse, and
    // a synthetic wheel event with Shift held stays vertical.
    if (process.platform !== "darwin") {
      const left = await horizontal.evaluate((element) => element.scrollLeft);
      await page.keyboard.down("Shift");
      await page.mouse.wheel(0, 180);
      await page.keyboard.up("Shift");
      await expect
        .poll(() => horizontal.evaluate((element) => element.scrollLeft))
        .toBeGreaterThan(left + 80);
      expect(await note.evaluate((element) => element.scrollTop)).toBe(
        vertical,
      );
    }
    await expect(table.locator(".table-cell-selected")).toHaveCount(20);
    expect(await page.evaluate(() => window.harness.text)).toBe(source);
  });
}

for (const selected of [false, true]) {
  test(`a mostly vertical diagonal wheel over a wide table scrolls the note (selected=${selected})`, async ({
    page,
  }) => {
    const source = wideTableNote();
    const { note, table, horizontal } = await openWideTable(
      page,
      source,
      false,
    );
    const cell = table.locator('td[data-row="15"][data-column="2"]');
    await cell.scrollIntoViewIfNeeded();
    if (selected) {
      await table.hover();
      await table.locator('.table-row-handle[data-index="15"]').click();
      await expect(table.locator(".table-cell-selected")).toHaveCount(20);
    }
    await cell.hover();
    const scrollTop = () => note.evaluate((element) => element.scrollTop);

    // Chromium latches such a wheel to the table, which can take its
    // sideways part; the note must still move by the vertical part.
    for (let tick = 0; tick < 4; tick++) {
      const top = await scrollTop();
      await page.mouse.wheel(30, 120);
      await expect.poll(scrollTop).toBe(top + 120);
    }

    // At the table's right edge the note takes the gesture itself, and the
    // vertical part must not be added a second time.
    await horizontal.evaluate((element) => {
      element.scrollLeft = element.scrollWidth;
    });
    const atEdge = await scrollTop();
    await page.mouse.wheel(30, 120);
    await expect.poll(scrollTop).toBe(atEdge + 120);
    await page.waitForTimeout(200);
    expect(await scrollTop()).toBe(atEdge + 120);

    const upward = await scrollTop();
    await page.mouse.wheel(-30, -120);
    await expect.poll(scrollTop).toBe(upward - 120);
    expect(await page.evaluate(() => window.harness.text)).toBe(source);
  });
}
