/** Regressions from the per-key Obsidian 1.14.4 table measurements (A/B/G/H/I/J/K/L/P). */
import { expect, test, type Page } from "@playwright/test";
import type { EditorView } from "@codemirror/view";
import { open } from "./harness";

const lines = [
  "prose above one here",
  "prose above two",
  "",
  "| alpha | beta  |",
  "| ----- | ----- |",
  "| gamma | delta |",
  "| eps   | zeta  |",
  "",
  "prose below one here",
  "prose below two",
  "",
];
const source = lines.join("\n");
const sourceOffset = (line: number, column = 0) =>
  lines.slice(0, line).reduce((offset, text) => offset + text.length + 1, 0) +
  column;

async function openVim(page: Page, line: number, column = 0) {
  await open(page, source, "obsidian", {
    features: { vim: { enabled: true, config: {} } },
  });
  await page.evaluate(
    (at) => window.harness.reveal(at),
    sourceOffset(line, column),
  );
  await expect(
    page.getByRole("textbox", { name: "Markdown content" }),
  ).toBeFocused();
}

async function press(page: Page, keys: string) {
  for (const key of keys) {
    await page.keyboard.press(key);
  }
}

function focusedCell(page: Page) {
  return page.evaluate(() => {
    // Like the measurement probe, read the focused inner view, not the hidden outer caret.
    const active = document.activeElement as
      | (HTMLElement & {
          cmTile?: { view?: EditorView };
        })
      | null;
    const inner = active?.cmTile?.view;
    return {
      label: active?.closest(".hybrid-table")
        ? active.getAttribute("aria-label")
        : null,
      text: inner?.state.doc.toString() ?? null,
      head: inner?.state.selection.main.head ?? null,
      mode:
        active?.closest(".cm-editor")?.getAttribute("data-caret-mode") ?? null,
    };
  });
}

async function expectCell(
  page: Page,
  row: number,
  column: number,
  text: string,
  head: number,
) {
  await expect
    .poll(() => focusedCell(page))
    .toEqual({
      label: `Table cell ${row + 1}, ${column + 1}`,
      text,
      head,
      mode: "normal",
    });
}

async function expectOuter(page: Page, line: number, column = 0) {
  await expect(
    page.getByRole("textbox", { name: "Markdown content" }),
  ).toBeFocused();
  await expect
    .poll(
      async () => (await page.evaluate(() => window.harness.viewState())).head,
    )
    .toBe(sourceOffset(line, column));
  await expect(page.locator(".hybrid-table .cm-content")).toHaveCount(0);
}

for (const goal of [0, 3, 8, 14]) {
  test(`A: j enters the header at source column ${goal}, resets offsets between rows and exits`, async ({
    page,
  }) => {
    await openVim(page, 1, goal);
    await press(page, "j");
    await expectOuter(page, 2);
    await press(page, "j");
    const column = goal === 14 ? 1 : 0;
    const offset = new Map([
      [0, 0],
      [3, 1],
      [8, 5],
      [14, 4],
    ]).get(goal)!;
    await expectCell(page, 0, column, column ? "beta" : "alpha", offset);
    await press(page, "j");
    await expectCell(page, 1, column, column ? "delta" : "gamma", 0);
    await press(page, "j");
    await expectCell(page, 2, column, column ? "zeta" : "eps", 0);
    await press(page, "j");
    await expectOuter(page, 7);
    expect(await page.evaluate(() => window.harness.text)).toBe(source);
  });

  test(`B: k enters the last row at source column ${goal}, resets offsets between rows and exits`, async ({
    page,
  }) => {
    await openVim(page, 8, goal);
    await press(page, "k");
    await expectOuter(page, 7);
    await press(page, "k");
    const column = goal === 14 ? 1 : 0;
    const offset = new Map([
      [0, 0],
      [3, 1],
      [8, 3],
      [14, 4],
    ]).get(goal)!;
    await expectCell(page, 2, column, column ? "zeta" : "eps", offset);
    await press(page, "k");
    await expectCell(page, 1, column, column ? "delta" : "gamma", 0);
    await press(page, "k");
    await expectCell(page, 0, column, column ? "beta" : "alpha", 0);
    await press(page, "k");
    await expectOuter(page, 2);
    expect(await page.evaluate(() => window.harness.text)).toBe(source);
  });
}

for (const { line, column, keys } of [
  { line: 1, column: 3, keys: "3j" },
  { line: 2, column: 0, keys: "2j" },
  { line: 8, column: 3, keys: "4k" },
  { line: 1, column: 14, keys: "3j" },
  { line: 8, column: 14, keys: "4k" },
]) {
  test(`H/P: ${keys} from ${line}:${column} lands on the delimiter and opens eps at zero`, async ({
    page,
  }) => {
    await openVim(page, line, column);
    await press(page, keys);
    await expectCell(page, 2, 0, "eps", 0);
  });
}

test("H: 5j uses source arithmetic and opens gamma at offset one", async ({
  page,
}) => {
  await openVim(page, 0, 3);
  await press(page, "5j");
  await expectCell(page, 1, 0, "gamma", 1);
});

test("H/K/G: cell counts and g prefixes hop one row and re-entry follows the neighbouring row", async ({
  page,
}) => {
  await openVim(page, 2);
  await press(page, "gj");
  await expectCell(page, 0, 0, "alpha", 0);
  await press(page, "9j");
  await expectCell(page, 1, 0, "gamma", 0);
  await press(page, "gj");
  await expectCell(page, 2, 0, "eps", 0);
  await press(page, "9k");
  await expectCell(page, 1, 0, "gamma", 0);
  await press(page, "gk");
  await expectCell(page, 0, 0, "alpha", 0);
  await press(page, "9k");
  await expectOuter(page, 2);
  await press(page, "j");
  await expectCell(page, 0, 0, "alpha", 0);
  await press(page, "jjj");
  await expectOuter(page, 7);
  await press(page, "gk");
  await expectCell(page, 2, 0, "eps", 0);
});

test("I: dk below the table deletes only the last source row and the blank line", async ({
  page,
}) => {
  await openVim(page, 7);
  await press(page, "dk");
  await expect
    .poll(() => page.evaluate(() => window.harness.text))
    .toBe(lines.filter((_, line) => line !== 6 && line !== 7).join("\n"));
  await expect(
    page.getByRole("textbox", { name: "Markdown content" }),
  ).toBeFocused();
  await expect(page.locator(".hybrid-table .cm-content")).toHaveCount(0);
});

test("I: d2j from prose deletes exactly three source lines, including the header", async ({
  page,
}) => {
  await openVim(page, 1, 3);
  await press(page, "d2j");
  await expect
    .poll(() => page.evaluate(() => window.harness.text))
    .toBe(lines.filter((_, line) => line < 1 || line > 3).join("\n"));
  await expect(
    page.getByRole("textbox", { name: "Markdown content" }),
  ).toBeFocused();
});

test("J: V+j extends one source line at a time through the table and never opens a cell", async ({
  page,
}) => {
  await openVim(page, 1, 3);
  await press(page, "V");
  for (const line of [2, 3, 4, 5, 6, 7]) {
    await press(page, "j");
    await expect
      .poll(async () => {
        const state = await page.evaluate(() => window.harness.viewState());
        return { anchor: state.anchor, head: state.head };
      })
      .toEqual({
        anchor: sourceOffset(1),
        head: sourceOffset(line, lines[line]!.length),
      });
    await expect(page.locator(".hybrid-table .cm-content")).toHaveCount(0);
    await expect(page.locator(".cm-editor").first()).toHaveAttribute(
      "data-caret-mode",
      "visual",
    );
  }
  expect(await page.evaluate(() => window.harness.text)).toBe(source);
});

test("L: paragraph } skips the table and /delta opens the matching cell", async ({
  page,
}) => {
  await openVim(page, 1, 3);
  await press(page, "}");
  await expectOuter(page, 2);
  await press(page, "}");
  await expectOuter(page, 7);
  await page.evaluate((at) => window.harness.reveal(at), sourceOffset(1, 3));
  await press(page, "/delta");
  await page.keyboard.press("Enter");
  await expectCell(page, 1, 1, "delta", 0);
  expect(await page.evaluate(() => window.harness.text)).toBe(source);
});

for (const motion of ["w", "W", "e", "b", "ge"]) {
  test(`normal ${motion} crosses cell and row boundaries without editing`, async ({
    page,
  }) => {
    const text =
      "Above\n\n| 每个环境共用 | next word |\n| --- | --- |\n| final | last,value |\n\nBelow";
    await open(page, text, "obsidian", {
      features: { vim: { enabled: true, config: {} } },
    });
    await page.evaluate(() => window.harness.reveal("Above\n\n".length + 2));
    await expectCell(page, 0, 0, "每个环境共用", 0);
    if (motion === "b" || motion === "ge") {
      await page.keyboard.press("Tab");
      await page.keyboard.press("Escape");
      await press(page, "0");
      await press(page, motion);
      await expectCell(page, 0, 0, "每个环境共用", motion === "b" ? 0 : 5);
    } else {
      if (motion === "e") {
        await press(page, "e");
        await expectCell(page, 0, 0, "每个环境共用", 5);
      }
      await press(page, motion);
      await expectCell(page, 0, 1, "next word", motion === "e" ? 3 : 0);
      await press(page, motion);
      await expectCell(page, 0, 1, "next word", motion === "e" ? 8 : 5);
      await press(page, motion);
      await expectCell(page, 1, 0, "final", motion === "e" ? 4 : 0);
    }
    expect(await page.evaluate(() => window.harness.text)).toBe(text);
  });
}

test("counted word motions span cells, skip blanks and preserve Unicode segmentation", async ({
  page,
}) => {
  const text =
    "Above\n\n| 每个环境共用 hello中文 café | next word |\n| --- | --- |\n| | last,value |\n\nBelow";
  await open(page, text, "obsidian", {
    features: { vim: { enabled: true, config: {} } },
  });
  await page.evaluate(() => window.harness.reveal("Above\n\n".length + 2));
  await press(page, "w");
  await expectCell(page, 0, 0, "每个环境共用 hello中文 café", 7);
  await press(page, "w");
  await expectCell(page, 0, 0, "每个环境共用 hello中文 café", 15);
  await press(page, "3w");
  await expectCell(page, 1, 1, "last,value", 0);
  await press(page, "2w");
  await expectCell(page, 1, 1, "last,value", 5);
  await press(page, "3b");
  await expectCell(page, 0, 1, "next word", 5);
  await press(page, "2ge");
  await expectCell(page, 0, 0, "每个环境共用 hello中文 café", 18);
  await press(page, "3W");
  await expectCell(page, 1, 1, "last,value", 0);
  await press(page, "W");
  await expectCell(page, 1, 1, "last,value", 9);
  expect(await page.evaluate(() => window.harness.text)).toBe(text);
});

test("cell word operators and visual selections remain in the cell buffer", async ({
  page,
}) => {
  await openVim(page, 2);
  await press(page, "j");
  await expectCell(page, 0, 0, "alpha", 0);
  await press(page, "vw");
  await expect
    .poll(() => focusedCell(page))
    .toMatchObject({ label: "Table cell 1, 1", text: "alpha", mode: "visual" });
  // Nested CellEditor mounts drawSelection; outer .mw-editor CSS does not hide it.
  await expect(
    page.locator(".hybrid-table .cm-selectionBackground"),
  ).not.toHaveCount(0);
  await page.keyboard.press("Escape");
  await press(page, "0dw");
  await expectCell(page, 0, 0, "", 0);
  expect(await page.evaluate(() => window.harness.text)).toContain("beta");
});

for (const [motion, line] of [
  ["gg", 0],
  ["G", lines.length - 1],
  ["2gg", 1],
  ["9G", 8],
  ["1G", 0],
  ["999gg", lines.length - 1],
] as const) {
  test(`cell normal ${motion} exits to the outer source line ${line + 1}`, async ({
    page,
  }) => {
    await openVim(page, 1);
    await press(page, "jj");
    await expectCell(page, 0, 0, "alpha", 0);
    await press(page, motion);
    await expectOuter(page, line);
    await expect(
      page.locator('.cm-editor[data-caret-mode="normal"]'),
    ).toHaveCount(1);
    expect(await page.evaluate(() => window.harness.text)).toBe(source);
    await press(page, "j");
    await expectOuter(page, Math.min(lines.length - 1, line + 1));
  });
}

for (const [motion, line] of [
  ["4gg", 3],
  ["6G", 5],
] as const) {
  test(`cell normal ${motion} keeps a table-source destination in the outer editor`, async ({
    page,
  }) => {
    await openVim(page, 1);
    await press(page, "jj");
    await expectCell(page, 0, 0, "alpha", 0);
    await press(page, motion);
    await expectOuter(page, line);
    expect(await page.evaluate(() => window.harness.text)).toBe(source);
  });
}

for (const [mapping, finalLine] of [
  ["ggx", 0],
  ["ggG", lines.length - 1],
  ["gg2Gx", 1],
] as const) {
  test(`cell mapping Q -> ${mapping} continues in the outer source buffer`, async ({
    page,
  }) => {
    await openVim(page, 1);
    // :nmap uses Vim.map with the normal-mode context in the pinned engine.
    await press(page, `:nmap Q ${mapping}`);
    await page.keyboard.press("Enter");
    await press(page, "jj");
    await expectCell(page, 0, 0, "alpha", 0);
    await press(page, "Q");
    const expectedDocuments = {
      ggx: source.slice(1),
      ggG: source,
      gg2Gx: source.replace("prose above two", "rose above two"),
    };
    const expected = expectedDocuments[mapping];
    await expect
      .poll(() => page.evaluate(() => window.harness.text))
      .toBe(expected);
    await expectOuter(page, finalLine);
    const caretLine = await page.evaluate(async () => {
      const state = await window.harness.viewState();
      return window.harness.text.slice(0, state.head).split("\n").length;
    });
    expect(caretLine).toBe(finalLine + 1);
  });
}

for (const [mapping, firstLine] of [
  ["ggiZ<Esc>", "ZAbove"],
  ["ggciwZ<Esc>", "Z"],
] as const) {
  test(`cell mapping Q -> ${mapping} inserts into the outer document`, async ({
    page,
  }) => {
    const document = source.replace("prose above one here", "Above");
    await open(page, document, "obsidian", {
      features: { vim: { enabled: true, config: {} } },
    });
    await page.evaluate(() => window.harness.reveal(0));
    await press(page, `:nmap Q ${mapping}`);
    await page.keyboard.press("Enter");
    await press(page, "jjj");
    await expectCell(page, 0, 0, "alpha", 0);
    await press(page, "Q");
    await expect
      .poll(() => page.evaluate(() => window.harness.text))
      .toBe(document.replace("Above", firstLine));
    await expectOuter(page, 0);
    await expect(
      page.locator('.cm-editor[data-caret-mode="normal"]'),
    ).toHaveCount(1);
  });
}

test("recorded macro inserts into the outer document after a cell document jump", async ({
  page,
}) => {
  await openVim(page, 0);
  await press(page, "qaggi");
  await page.keyboard.type("Z");
  await page.keyboard.press("Escape");
  await press(page, "q");
  await expect
    .poll(() => page.evaluate(() => window.harness.text))
    .toBe(`Z${source}`);
  await press(page, "jjj");
  await expectCell(page, 0, 0, "alpha", 0);
  await press(page, "@a");
  await expect
    .poll(() => page.evaluate(() => window.harness.text))
    .toBe(`ZZ${source}`);
  await expectOuter(page, 0);
  await expect(
    page.locator('.cm-editor[data-caret-mode="normal"]'),
  ).toHaveCount(1);
});
