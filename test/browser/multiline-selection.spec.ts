/**
 * Multi-line selections as Obsidian 1.14.4 draws them
 * (/workspace/plans/multiline-selection-findings.md): the tint hugs each
 * line's text with a short stub for the line break, empty lines get a thin
 * stub, code blocks are tinted only on their code, and revealed HTML, quotes
 * and lists look like Obsidian's source. A mouse drag keeps everything
 * rendered until the button is released.
 */
import { test, expect, type Page } from "@playwright/test";
import { open } from "./harness";

const NOTE = [
  "# Core fixture",
  "A paragraph with **bold**, _italic_ and `literal` text.",
  "",
  "```text",
  "plain code line one",
  "```",
  "",
  '<div class="note">HTML block content</div>',
  "",
  "> A quoted line with **bold**",
  "",
  "- first item",
  "- second item",
  "",
  "### Third heading",
  "",
  "Trailing paragraph.",
  "",
].join("\n");
const lines = NOTE.split("\n");
const start = (n: number) =>
  lines.slice(0, n - 1).reduce((sum, line) => sum + line.length + 1, 0);
const end = (n: number) => start(n) + lines[n - 1]!.length;

async function select(page: Page, anchor: number, head: number) {
  await page.evaluate(
    ([anchor, head]) => {
      const view = [...window.harness.views[0]!.runtime.fibers].find(
        (fiber) => fiber.definition.name === "livePreview",
      )!.context!.editor.view;
      view.focus();
      view.dispatch({ selection: { anchor: anchor!, head: head! } });
    },
    [anchor, head],
  );
  await page.waitForTimeout(100);
}

const line = (page: Page, n: number) =>
  page.locator(".cm-content > .cm-line").nth(n - 1);

/** Drawn selection rectangles that overlap a line, vertically. */
const rectsOn = (page: Page, n: number) =>
  line(page, n).evaluate((element) => {
    const box = element.getBoundingClientRect();
    return [...document.querySelectorAll(".cm-selectionBackground")]
      .map((marker) => marker.getBoundingClientRect())
      .filter(
        (rect) =>
          rect.width > 0 &&
          rect.top < box.bottom - 2 &&
          rect.bottom > box.top + 2,
      )
      .map((rect) => ({ left: rect.left, right: rect.right }));
  });

test("the selection hugs each line's text, with stubs and no full-width band", async ({
  page,
}) => {
  await page.setViewportSize({ width: 900, height: 700 });
  await open(page, NOTE);
  await select(page, start(2), end(15));
  const content = (await page.locator(".cm-content").boundingBox())!;

  // A text line: tinted to just past its text, far from the right edge.
  const paragraph = await rectsOn(page, 2);
  const textRight = await line(page, 2).evaluate((element) => {
    const range = document.createRange();
    range.selectNodeContents(element);
    return Math.max(...[...range.getClientRects()].map((rect) => rect.right));
  });
  const right = Math.max(...paragraph.map((rect) => rect.right));
  expect(right).toBeGreaterThan(textRight);
  expect(right - textRight).toBeLessThan(12);
  expect(right).toBeLessThan(content.x + content.width - 100);

  // An empty line: one thin stub.
  const empty = await rectsOn(page, 3);
  expect(empty).toHaveLength(1);
  expect(empty[0]!.right - empty[0]!.left).toBeLessThanOrEqual(5);

  // A code line: only the code is tinted, not the block's width.
  const code = await rectsOn(page, 5);
  const block = (await line(page, 5).boundingBox())!;
  expect(Math.max(...code.map((rect) => rect.right))).toBeLessThan(
    block.x + block.width - 100,
  );

  // The last line ends at its text, with no stub.
  const last = await rectsOn(page, 15);
  const lastText = await line(page, 15).evaluate((element) => {
    const range = document.createRange();
    range.selectNodeContents(element);
    return Math.max(...[...range.getClientRects()].map((rect) => rect.right));
  });
  expect(
    Math.abs(Math.max(...last.map((rect) => rect.right)) - lastText),
  ).toBeLessThan(2);
});

test("revealed HTML keeps its colours, quotes show a dim > and lists a dim -", async ({
  page,
}) => {
  await open(page, NOTE);
  await select(page, start(8), end(13));
  const html = line(page, 8);
  await expect(html).toContainText('<div class="note">');
  await expect(html.locator(".token.tag").first()).toBeAttached();
  await expect(html.locator(".token.attr-name")).toHaveText("class");
  await expect(html.locator(".token.attr-value").first()).toContainText("note");

  const quote = line(page, 10);
  await expect(quote).toHaveClass(/is-revealed/);
  await expect(quote).toHaveCSS("background-image", "none");
  await expect(quote).toHaveCSS("padding-left", "2px");
  await expect(quote.locator(".md-syntax-mark").first()).toHaveText(">");

  // The revealed `-` is dim and the item's text stays where it was.
  const item = line(page, 12);
  await expect(item.locator(".md-list-mark-source")).toHaveText("- ");
  const mark = item.locator(".md-list-mark-source");
  const markColour = await mark.evaluate(
    (element) => getComputedStyle(element).color,
  );
  const textColour = await item.evaluate(
    (element) => getComputedStyle(element).color,
  );
  expect(markColour).not.toBe(textColour);
});

test("the list item's text does not move when its marker is revealed", async ({
  page,
}) => {
  await open(page, NOTE);
  const textLeft = () =>
    page.locator(".cm-line", { hasText: "first item" }).evaluate((element) => {
      const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
      let node: Node | null;
      while ((node = walker.nextNode())) {
        const index = node.nodeValue!.indexOf("first");
        if (index >= 0) {
          const range = document.createRange();
          range.setStart(node, index);
          range.setEnd(node, index + 1);
          return range.getBoundingClientRect().left;
        }
      }
      return NaN;
    });
  await select(page, start(17), start(17));
  const rendered = await textLeft();
  await select(page, start(12), end(12));
  expect(Math.abs((await textLeft()) - rendered)).toBeLessThan(1.5);
});

test("a mouse drag keeps the note rendered until the button is released", async ({
  page,
}) => {
  await page.setViewportSize({ width: 900, height: 700 });
  await open(page, NOTE);
  await select(page, start(17), start(17));
  const paragraph = line(page, 2);
  await expect(paragraph).not.toContainText("**");
  await expect(page.locator(".code-language")).toHaveText(/text/i);
  const from = (await paragraph.boundingBox())!;
  // The rendered HTML block's widget.
  const html = page.locator(".cm-content .hybrid-block").first();
  await expect(html).toBeVisible();
  const to = (await html.boundingBox())!;

  await page.mouse.move(from.x + 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(to.x + 40, to.y + to.height / 2, { steps: 10 });
  // Mid-drag: the selection is drawn, but nothing is revealed yet.
  await expect(
    page.locator(".mw-selection-layer .cm-selectionBackground").first(),
  ).toBeVisible();
  await expect(paragraph).not.toContainText("**");
  await expect(html).toBeVisible();
  await expect(page.locator(".code-language")).toHaveText(/text/i);

  await page.mouse.up();
  // Released: the touched lines show their source.
  await expect(paragraph).toContainText("**bold**");
  await expect(page.locator(".code-language")).toHaveCount(0);
  await expect(line(page, 4)).toContainText("```text");
});

/** For each visual row of a line: its text's right edge and the tint's. */
const rows = (page: Page, n: number) =>
  line(page, n).evaluate((element) => {
    const range = document.createRange();
    range.selectNodeContents(element);
    const text = [...range.getClientRects()].filter((r) => r.width > 0);
    const tops = [...new Set(text.map((r) => Math.round(r.top)))].sort(
      (a, b) => a - b,
    );
    const tint = [...document.querySelectorAll(".cm-selectionBackground")]
      .map((marker) => marker.getBoundingClientRect())
      .filter((r) => r.width > 0);
    return tops.map((top) => {
      const row = text.filter((r) => Math.abs(Math.round(r.top) - top) < 3);
      const mid = top + row[0]!.height / 2;
      const marks = tint.filter((r) => r.top < mid && r.bottom > mid);
      return {
        text: Math.max(...row.map((r) => r.right)),
        tint: marks.length ? Math.max(...marks.map((r) => r.right)) : null,
      };
    });
  });

for (const code of [false, true]) {
  test(`wrapped ${code ? "code lines" : "paragraphs"}: each visual row's tint ends at its text`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 420, height: 700 });
    const long = "abcdefghijklmnopqrstuvwxyzabcdefghij";
    const two = `short first ${long} end`;
    const three = `tiny ${long} ${long} ${long} done`;
    const body = code
      ? ["```text", two, three, "```", "next", ""]
      : [two, three, "next", ""];
    await open(page, body.join("\n"));
    const lineNo = code ? 2 : 1;
    const startPos = code ? 8 : 0;
    const endPos = startPos + two.length + 1 + three.length + 1;
    await select(page, startPos, endPos);
    for (const n of [lineNo, lineNo + 1]) {
      const measured = await rows(page, n);
      expect(measured.length).toBeGreaterThanOrEqual(2);
      for (const row of measured.slice(0, -1)) {
        expect(row.tint).not.toBeNull();
        // Hugs the text (a wrap point may leave a trailing space).
        expect(row.tint! - row.text).toBeLessThan(14);
      }
    }
  });
}

/**
 * Every visual row of line `n`: the selected text's box and the union of
 * the tint markers that overlap it vertically. Rows come from the browser's
 * own text layout, independent of the layer's arithmetic.
 */
const bands = (page: Page, n: number) =>
  line(page, n).evaluate((element) => {
    const range = document.createRange();
    range.selectNodeContents(element);
    const text = [...range.getClientRects()].filter((r) => r.width > 0);
    const rows: { top: number; bottom: number; left: number; right: number }[] =
      [];
    for (const r of [...text].sort((a, b) => a.top - b.top)) {
      const mid = (r.top + r.bottom) / 2;
      const row = rows.find((row) => mid >= row.top && mid <= row.bottom);
      if (row) {
        row.top = Math.min(row.top, r.top);
        row.bottom = Math.max(row.bottom, r.bottom);
        row.left = Math.min(row.left, r.left);
        row.right = Math.max(row.right, r.right);
      } else {
        rows.push({
          top: r.top,
          bottom: r.bottom,
          left: r.left,
          right: r.right,
        });
      }
    }
    const tint = [
      ...document.querySelectorAll(
        ".mw-selection-layer .cm-selectionBackground",
      ),
    ]
      .map((m) => m.getBoundingClientRect())
      .filter((r) => r.width > 0);
    return rows.map((row) => {
      const marks = tint.filter(
        (m) => m.top < row.bottom - 1 && m.bottom > row.top + 1,
      );
      return {
        text: row,
        tint: marks.length
          ? {
              top: Math.min(...marks.map((m) => m.top)),
              bottom: Math.max(...marks.map((m) => m.bottom)),
              left: Math.min(...marks.map((m) => m.left)),
              right: Math.max(...marks.map((m) => m.right)),
            }
          : null,
      };
    });
  });

const LONG = "abcdefghijklmnopqrstuvwxyzabcdefghij";
const WRAPPED = `tiny ${LONG} ${LONG} ${LONG} done`;
const CASES = [
  {
    name: "proportional 16px / 1.5",
    font: "Arial, sans-serif",
    size: 16,
    lh: 1.5,
  },
  { name: "monospace 16px / 1.5", font: "monospace", size: 16, lh: 1.5 },
  { name: "proportional 14px / 2", font: "Arial, sans-serif", size: 14, lh: 2 },
  {
    name: "proportional 20px / 1.2",
    font: "Arial, sans-serif",
    size: 20,
    lh: 1.2,
  },
];
for (const c of CASES) {
  for (const kind of ["paragraph", "heading", "code"] as const) {
    test(`wrapped ${kind} rows (${c.name}): every band covers its row's text, top to bottom`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: 420, height: 900 });
      const body =
        kind === "code"
          ? ["```text", WRAPPED, "```", "next", ""]
          : kind === "heading"
            ? [`## ${WRAPPED}`, "next", ""]
            : [WRAPPED, "next", ""];
      await open(page, body.join("\n"));
      await page.evaluate((value) => window.harness.configureEditor(value), {
        fontSize: c.size,
        lineHeight: c.lh,
      });
      await page.addStyleTag({
        content: `.cm-content .cm-line, .cm-content .cm-line * { font-family: ${c.font} !important; }`,
      });
      const n = kind === "code" ? 2 : 1;
      const from = kind === "code" ? 8 : 0;
      const lineText = kind === "heading" ? `## ${WRAPPED}` : WRAPPED;
      // Caret far away first so the line keeps its rendered form, then select
      // the whole line with its break.
      await select(page, from, from + lineText.length + 1);
      const measured = await bands(page, n);
      expect(measured.length, "visual rows").toBeGreaterThanOrEqual(3);
      measured.forEach(({ text, tint }, i) => {
        const label = `row ${i + 1}`;
        expect(tint, label).not.toBeNull();
        // Vertical: the band covers the text's glyph box.
        expect(tint!.top, `${label} top`).toBeLessThanOrEqual(text.top + 0.5);
        expect(tint!.bottom, `${label} bottom`).toBeGreaterThanOrEqual(
          text.bottom - 0.5,
        );
        // Horizontal, both sides: starts at the text, ends just past it.
        expect(Math.abs(tint!.left - text.left), `${label} left`).toBeLessThan(
          3,
        );
        expect(tint!.right - text.right, `${label} right`).toBeGreaterThan(-1);
        expect(tint!.right - text.right, `${label} right`).toBeLessThan(14);
      });
      // Consecutive bands meet: no gap and no overlap between rows.
      for (let i = 1; i < measured.length; i++) {
        const gap = measured[i]!.tint!.top - measured[i - 1]!.tint!.bottom;
        expect(Math.abs(gap), `gap above row ${i + 1}`).toBeLessThan(1.5);
      }
    });
  }
}
