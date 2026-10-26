/**
 * Hovering a table or editing a cell must not install a non-passive wheel
 * listener. Grid selection still forwards vertical wheel to the note.
 * An open cell survives scrolling the table out of the viewport and back.
 */
import { expect, test, type Page } from "@playwright/test";
import { open } from "./harness";

function note(rows = 8): string {
  const before = Array.from(
    { length: 8 },
    (_, index) => `Before ${index}`,
  ).join("\n\n");
  const body = Array.from(
    { length: rows },
    (_, index) => `| cell-${index}-a | cell-${index}-b |`,
  ).join("\n");
  const after = Array.from(
    { length: 150 },
    (_, index) => `After ${index} keeps the table off screen.`,
  ).join("\n\n");
  return `${before}\n\n| A | B |\n| --- | --- |\n${body}\n\n${after}`;
}

async function constrain(page: Page): Promise<void> {
  await page.addStyleTag({
    content:
      "#app, #app .cm-editor, #app .cm-scroller { height: 640px !important; max-height: 640px !important; } #app .cm-scroller { overflow: auto !important; } .panel { height: 100%; min-height: 0; display: flex; flex-direction: column; }",
  });
  await page.evaluate(() => window.dispatchEvent(new Event("resize")));
}

async function wheelPrevented(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const root = document.querySelector(".hybrid-table");
    if (!root) {
      return false;
    }
    let prevented = false;
    const event = new WheelEvent("wheel", {
      deltaY: 48,
      bubbles: true,
      cancelable: true,
    });
    const prevent = event.preventDefault.bind(event);
    event.preventDefault = () => {
      prevented = true;
      prevent();
    };
    root.dispatchEvent(event);
    return prevented;
  });
}

test("hovering or editing a table scrolls the note without capturing wheel", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1000, height: 760 });
  const source = note();
  await open(page, source, "obsidian", {
    features: { vim: { enabled: false, config: {} } },
  });
  await constrain(page);
  await page.evaluate(
    (from) => window.harness.reveal(from),
    source.indexOf("| A | B |"),
  );
  const table = page.locator(".hybrid-table");
  await expect(table).toBeVisible();
  await table.hover();
  expect(await wheelPrevented(page)).toBe(false);

  const noteScroller = page.locator(".cm-scroller").first();
  const before = await noteScroller.evaluate((element) => element.scrollTop);
  await page.mouse.wheel(0, 180);
  await expect
    .poll(() => noteScroller.evaluate((element) => element.scrollTop))
    .toBeGreaterThan(before + 40);

  const cell = table.locator(".table-cell-content").nth(2);
  const box = (await cell.boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await expect(page.locator(".hybrid-table .cm-editor")).toHaveCount(1);
  expect(await wheelPrevented(page)).toBe(false);
  const editing = await noteScroller.evaluate((element) => element.scrollTop);
  await page.mouse.wheel(0, 180);
  await expect
    .poll(() => noteScroller.evaluate((element) => element.scrollTop))
    .toBeGreaterThan(editing + 40);
  await expect(page.locator(".hybrid-table .cm-editor")).toHaveCount(1);
});

test("scrolling an open cell offscreen keeps it when the table returns", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1000, height: 760 });
  const source = note(6);
  await open(page, source, "obsidian", {
    features: { vim: { enabled: false, config: {} } },
  });
  await constrain(page);
  const tableAt = source.indexOf("| A | B |");
  await page.evaluate((from) => window.harness.reveal(from), tableAt);
  const cell = page.locator(".hybrid-table .table-cell-content").nth(2);
  await expect(cell).toBeVisible();
  const box = (await cell.boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await expect(page.locator(".hybrid-table .cm-editor")).toHaveCount(1);

  const noteScroller = page.locator(".cm-scroller").first();
  const tableScrollTop = await noteScroller.evaluate((el) => el.scrollTop);
  await noteScroller.evaluate((el) => {
    el.scrollTop = el.scrollHeight;
  });
  await expect
    .poll(() => noteScroller.evaluate((el) => el.scrollTop))
    .toBeGreaterThan(tableScrollTop + 1000);
  await noteScroller.evaluate((el, top) => {
    el.scrollTop = top;
  }, tableScrollTop);
  await expect(page.locator(".hybrid-table .cm-editor")).toHaveCount(1);
  await expect(page.locator(".hybrid-table .cm-content")).toContainText(
    "cell-0-a",
  );
});

test("a selected table row still captures vertical wheel for the note", async ({
  page,
}) => {
  await page.setViewportSize({ width: 900, height: 600 });
  const columns = Array.from({ length: 12 }, (_, index) => `Column ${index}`);
  const before = Array.from(
    { length: 20 },
    (_, index) => `Before ${index}`,
  ).join("\n\n");
  const header = `| ${columns.join(" | ")} |`;
  const rule = `| ${columns.map(() => "---").join(" | ")} |`;
  const rows = Array.from(
    { length: 8 },
    (_, row) =>
      `| ${columns.map((_, column) => `R${row}C${column}`).join(" | ")} |`,
  ).join("\n");
  const source = `${before}\n\n${header}\n${rule}\n${rows}\n\nAfter the table.`;
  await open(page, source, "obsidian", {
    features: { vim: { enabled: false, config: {} } },
  });
  await constrain(page);
  await page.evaluate(
    (from) => window.harness.reveal(from),
    source.indexOf(header),
  );
  const table = page.locator(".hybrid-table");
  await table.hover();
  await table.locator('.table-row-handle[data-index="1"]').click();
  await expect(table).toBeFocused();
  expect(await wheelPrevented(page)).toBe(true);
});
