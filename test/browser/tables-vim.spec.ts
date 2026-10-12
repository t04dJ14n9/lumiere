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
