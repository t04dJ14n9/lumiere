// Probe (not a regression test): replays docs/obsidian-measurements/tables/vim-cases.json
// against our editor and prints the same columns as vim-probe.mjs. Enabled by VIM_TABLE_PROBE=1.
import { test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { open } from "./harness";

const cases = JSON.parse(
  readFileSync("docs/obsidian-measurements/tables/vim-cases.json", "utf8"),
) as {
  name: string;
  text?: string;
  caret: { line: number; ch: number };
  keys: string[];
}[];
const TEXT = [
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
].join("\n");

test.skip(!process.env.VIM_TABLE_PROBE, "measurement probe only");
test.setTimeout(900_000);

for (const c of cases) {
  if (
    process.env.VIM_TABLE_PROBE !== "all" &&
    !c.name.includes(process.env.VIM_TABLE_PROBE!)
  ) {
    continue;
  }
  test(c.name, async ({ page }) => {
    const text = c.text ?? TEXT;
    await open(page, text, "obsidian", {
      features: { vim: { enabled: true, config: {} } },
    });
    const lines = text.split("\n");
    const offset =
      lines.slice(0, c.caret.line).join("\n").length +
      (c.caret.line ? 1 : 0) +
      c.caret.ch;
    const line = lines[c.caret.line]!;
    if (line.startsWith("|") && !/^\|\s*-/.test(line)) {
      // Obsidian focuses the cell for a caret in the table source; ours needs a click.
      const rowLines = lines.filter(
        (l) => l.startsWith("|") && !/^\|\s*-/.test(l),
      );
      const row = rowLines.indexOf(line);
      const cellStarts: number[] = [];
      for (let i = 0; i < line.length; i++) {
        if (line[i] === "|" && i + 2 <= line.length) {
          cellStarts.push(i + 2);
        }
      }
      let column = cellStarts.filter((st) => st <= c.caret.ch).length - 1;
      column = Math.max(column, 0);
      const columns = cellStarts.length;
      await page
        .locator(".hybrid-table .table-cell-content")
        .nth(row * columns + column)
        .click();
      await page.keyboard.press("Escape");
      await page.keyboard.press("0");
      for (let i = cellStarts[column]!; i < c.caret.ch; i++) {
        await page.keyboard.press("l");
      }
    } else {
      await page.evaluate((at) => window.harness.reveal(at), offset);
      await page.keyboard.press("Escape");
      await page.evaluate((at) => window.harness.reveal(at), offset);
    }
    await page.waitForTimeout(200);
    const snap = async () => {
      const state = await page.evaluate(() => window.harness.viewState());
      const doc = await page.evaluate(() => window.harness.text);
      const pos = (o: number) => {
        const before = doc.slice(0, o).split("\n");
        return `${before.length - 1}:${before.at(-1)!.length}`;
      };
      const dom = await page.evaluate(() => {
        const a = document.activeElement as HTMLElement | null;
        const cell = a?.closest(".hybrid-table");
        const view = (
          a as unknown as {
            cmTile?: {
              view?: {
                state: {
                  doc: { toString(): string };
                  selection: { main: { head: number; anchor: number } };
                };
              };
            };
          }
        )?.cmTile?.view;
        const label = cell
          ? (a!.closest(".cm-content")?.getAttribute("aria-label") ??
            a!.getAttribute("aria-label"))
          : null;
        return {
          inCell: Boolean(cell),
          label,
          text: view?.state.doc.toString(),
          head: view?.state.selection.main.head,
          anchor: view?.state.selection.main.anchor,
          fat: Boolean(document.querySelector(".cm-fat-cursor")),
          active: a
            ? `${a.tagName}.${String(a.className).split(" ")[0]}`
            : null,
        };
      });
      const sel =
        state.anchor === state.head
          ? ""
          : ` sel=${pos(state.anchor)}-${pos(state.head)}`;
      const mode = dom.fat
        ? state.anchor === state.head
          ? "normal"
          : "visual"
        : "insert";
      const where = dom.inCell
        ? `IN-CELL ${dom.label} "${dom.text}" head=${dom.head}${dom.anchor !== dom.head ? ` anchor=${dom.anchor}` : ""}`
        : `outer active=${dom.active}`;
      return `${mode.padEnd(7)} src=${pos(state.head)}${sel} | ${where}${doc !== text ? " [doc rewritten]" : ""}`;
    };
    const out = [
      `\n### ${c.name}\nstart: \`${c.caret.line}:${c.caret.ch}\`\n\n\`\`\``,
    ];
    out.push(`start        ${await snap()}`);
    for (const k of c.keys) {
      await page.keyboard.press(k);
      await page.waitForTimeout(150);
      out.push(`${k.padEnd(12)} ${await snap()}`);
    }
    const doc = await page.evaluate(() => window.harness.text);
    if (doc !== text) {
      out.push(`doc after: ${JSON.stringify(doc)}`);
    }
    out.push("```");
    console.log(out.join("\n"));
  });
}
