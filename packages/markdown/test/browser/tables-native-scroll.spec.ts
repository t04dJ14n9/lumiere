/**
 * No table state cancels wheel input: hovering, editing a cell and a grid
 * selection all leave vertical wheel to the browser, which scrolls the note.
 * An open cell survives scrolling the table out of the viewport and back.
 */
import { expect, test, type Page } from "@playwright/test";
import type { EditorView } from "@codemirror/view";
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

/**
 * An open cell keeps the note's caret in its source, so CodeMirror keeps the
 * table mounted however far the note scrolls. Stand in for any change that
 * moves the note's caret without going through the table.
 */
async function moveNoteCaretOffTable(page: Page): Promise<void> {
  await page.evaluate(() => {
    const content = document.querySelector(
      '[aria-label="Markdown content"]',
    ) as (HTMLElement & { cmTile?: { view?: EditorView } }) | null;
    content!.cmTile!.view!.dispatch({ selection: { anchor: 0 } });
  });
}

/** Scroll until CodeMirror unmounts the table; the result scrolls it back. */
async function scrollTableAway(page: Page): Promise<() => Promise<void>> {
  const noteScroller = page.locator(".cm-scroller").first();
  const tableScrollTop = await noteScroller.evaluate((el) => el.scrollTop);
  await noteScroller.evaluate((el) => {
    el.scrollTop = el.scrollHeight;
  });
  await expect(page.locator(".hybrid-table")).toHaveCount(0);
  return async () => {
    await noteScroller.evaluate((el, top) => {
      el.scrollTop = top;
    }, tableScrollTop);
    await expect(page.locator(".hybrid-table")).toBeVisible();
    // A retained cell resumes in a microtask after the widget mounts.
    await page.evaluate(
      () =>
        new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve)),
        ),
    );
  };
}

async function openCell(page: Page): Promise<void> {
  const cell = page.locator(".hybrid-table .table-cell-content").nth(2);
  await expect(cell).toBeVisible();
  const box = (await cell.boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await expect(page.locator(".hybrid-table .cm-editor")).toHaveCount(1);
}

for (const state of ["a selected row", "an open cell"] as const) {
  test(`clicking the note while ${state} is off screen leaves the table`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1000, height: 760 });
    const source = note(6);
    await open(page, source, "obsidian", {
      features: { vim: { enabled: false, config: {} } },
    });
    await constrain(page);
    await page.evaluate(() => window.harness.reveal(0));
    const table = page.locator(".hybrid-table");
    if (state === "a selected row") {
      await table.hover();
      await table.locator('.table-row-handle[data-index="1"]').click();
      await expect(table).toBeFocused();
    } else {
      await openCell(page);
      await moveNoteCaretOffTable(page);
    }
    const scrollBack = await scrollTableAway(page);

    await page.locator(".cm-line", { hasText: "After 148 keeps" }).click();
    const outer = page.getByRole("textbox", { name: "Markdown content" });
    await expect(outer).toBeFocused();
    // Table commands no longer reach the unmounted table.
    expect(
      await page.evaluate(() =>
        window.harness.run("editor:table-insert-row-below"),
      ),
    ).toBe(false);
    expect(await page.evaluate(() => window.harness.text)).toBe(source);

    await scrollBack();
    await expect(table.locator(".cm-editor")).toHaveCount(0);
    await expect(table.locator(".table-cell-selected")).toHaveCount(0);
    await expect(outer).toBeFocused();
  });
}

test("a selected table row leaves vertical wheel to the browser", async ({
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
  expect(await wheelPrevented(page)).toBe(false);

  const noteScroller = page.locator(".cm-scroller").first();
  const scrollTop = () => noteScroller.evaluate((element) => element.scrollTop);
  const selectedTop = await scrollTop();
  expect(selectedTop).toBeGreaterThan(120);
  await page.mouse.wheel(0, -120);
  await expect.poll(scrollTop).toBe(selectedTop - 120);
  await expect(table).toBeFocused();
  await expect(table.locator(".table-cell-selected")).toHaveCount(12);
});
