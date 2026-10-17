/**
 * The selection over lines with inline graphics and widgets, drawn while a
 * mouse drag keeps the note rendered: inline math (MathJax SVG), images,
 * checkboxes, footnote references, mixed inline content and right-to-left
 * runs. Atomic inline content counts as one box: its internals (SVG paths,
 * glyph groups) never become rows. Every unwrapped line gets exactly one
 * band, covering the line box top to bottom and its content left to right.
 * The oracle is the known layout (the .cm-line box and its in-flow
 * children), not the layer's row grouping.
 */
import { test, expect, type Page } from "@playwright/test";
import { open } from "./harness";

const PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACgAAAAoCAIAAAADnC86AAAALUlEQVR4nO3NMQkAAAwDsPo3vckolED+5JKKzioWi8VisVgsFovFYrFYLB6NH6r1OhvW1o1iAAAAAElFTkSuQmCC";

const LINES: Record<string, string> = {
  "inline math": "before $\\sum_{i=1}^n x_i$ after",
  "tall inline math": "before $\\frac{a}{b^{2^{3}}}$ after",
  image: `before ![](${PNG}) after`,
  "task checkbox": "- [ ] before task after",
  "footnote reference": "before[^n] after",
  mixed: "a **bold** _it_ `code` [link](https://example.com) $x^2$ [^n] end",
  "right-to-left runs": "english עברית text مرحبا end",
  "mixed rtl and math": "abc שלום $\\sqrt{x}$ عالم end",
};

/** Drag from the start of line 1 to the start of line 2 and hold. */
async function dragFirstLine(page: Page) {
  const lines = page.locator(".cm-content > .cm-line");
  const a = (await lines.nth(0).boundingBox())!;
  const b = (await lines.nth(1).boundingBox())!;
  await page.mouse.move(a.x + 1, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + 1, b.y + b.height / 2, { steps: 6 });
  await page.waitForTimeout(200);
}

/** Line 1's box, its in-flow content extent and the markers centred on it. */
const measure = (page: Page) =>
  page
    .locator(".cm-content > .cm-line")
    .first()
    .evaluate((line) => {
      const box = line.getBoundingClientRect();
      let left = Infinity;
      let right = -Infinity;
      for (const child of line.childNodes) {
        let rects: DOMRect[] = [];
        if (child.nodeType === Node.TEXT_NODE) {
          const range = document.createRange();
          range.selectNodeContents(child);
          rects = [...range.getClientRects()];
        } else if (
          child instanceof Element &&
          !child.classList.contains("cm-widgetBuffer")
        ) {
          rects = [...child.getClientRects()];
        }
        for (const r of rects.filter((r) => r.width > 0)) {
          left = Math.min(left, r.left);
          right = Math.max(right, r.right);
        }
      }
      const marks = [
        ...document.querySelectorAll(
          ".mw-selection-layer .cm-selectionBackground",
        ),
      ]
        .map((m) => m.getBoundingClientRect())
        .filter((r) => {
          const mid = (r.top + r.bottom) / 2;
          return mid > box.top && mid < box.bottom && r.width > 0;
        })
        .map((r) => ({
          top: r.top,
          bottom: r.bottom,
          left: r.left,
          right: r.right,
        }));
      const graphics = line.querySelectorAll(
        "svg, img:not(.cm-widgetBuffer), input",
      ).length;
      return {
        box: { top: box.top, bottom: box.bottom },
        left,
        right,
        marks,
        graphics,
      };
    });

for (const [name, text] of Object.entries(LINES)) {
  test(`${name}: one band over the whole line while dragging`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 900, height: 600 });
    const doc = `${text}\nnext\n\nlast\n\n[^n]: A definition.\n`;
    await open(page, doc);
    await page.evaluate((end) => window.harness.reveal(end), doc.length - 1);
    await dragFirstLine(page);
    const sel = await page.evaluate(() => {
      const view = [...window.harness.views[0]!.plugins].find(
        (fiber) => fiber.definition.name === "livePreview",
      )!.context!.editor.view;
      return view.state.selection.main;
    });
    // A list line's first pixel is in its marker; the drag starts there or
    // at the line start.
    expect(sel.from).toBeLessThanOrEqual(name === "task checkbox" ? 6 : 0);
    expect(sel.to).toBe(text.length + 1);
    const m = await measure(page);
    if (/math|image|checkbox|mixed/.test(name)) {
      // Still rendered: the graphic is in the line while measuring.
      expect(m.graphics, "rendered graphics").toBeGreaterThan(0);
    }
    expect(m.marks.length).toBeGreaterThan(0);
    // Exactly one band, the line box top to bottom.
    expect(new Set(m.marks.map((r) => Math.round(r.top))).size, "bands").toBe(
      1,
    );
    for (const r of m.marks) {
      expect(Math.abs(r.top - m.box.top), "band top").toBeLessThan(1);
      expect(Math.abs(r.bottom - m.box.bottom), "band bottom").toBeLessThan(1);
    }
    // Affirmative horizontal coverage: the tint runs, merged, cover the
    // line's content from its left edge to its right edge without gaps.
    const runs = [...m.marks].sort((a, b) => a.left - b.left);
    let reach = runs[0]!.left;
    expect(reach, "starts at the content").toBeLessThanOrEqual(m.left + 1);
    for (const r of runs) {
      expect(r.left, "no gap in the tint").toBeLessThanOrEqual(reach + 1.5);
      reach = Math.max(reach, r.right);
    }
    expect(reach, "reaches the content end").toBeGreaterThanOrEqual(
      m.right - 1,
    );
    await page.mouse.up();
  });
}

test("block math: the rendered block is tinted as one box while dragging", async ({
  page,
}) => {
  await page.setViewportSize({ width: 900, height: 600 });
  const doc = "before\n\n$$\n\\sum_{i=1}^n x_i\n$$\n\nafter\n\nlast\n";
  await open(page, doc);
  await page.evaluate((end) => window.harness.reveal(end), doc.length - 1);
  const math = page.locator(".cm-content .hybrid-math").first();
  await expect(math).toBeVisible();
  const from = (await page
    .locator(".cm-content > .cm-line")
    .first()
    .boundingBox())!;
  const after = page.locator(".cm-content > .cm-line", { hasText: "after" });
  const to = (await after.boundingBox())!;
  await page.mouse.move(from.x + 1, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(to.x + 1, to.y + to.height / 2, { steps: 6 });
  await page.waitForTimeout(200);
  await expect(math).toBeVisible();
  const result = await math.evaluate((block) => {
    const box = block.getBoundingClientRect();
    const marks = [
      ...document.querySelectorAll(
        ".mw-selection-layer .cm-selectionBackground",
      ),
    ]
      .map((m) => m.getBoundingClientRect())
      .filter((r) => r.top < box.bottom - 1 && r.bottom > box.top + 1);
    return {
      box: {
        top: box.top,
        bottom: box.bottom,
        left: box.left,
        right: box.right,
      },
      marks: marks.map((r) => ({
        top: r.top,
        bottom: r.bottom,
        left: r.left,
        right: r.right,
      })),
    };
  });
  // One marker for the block, covering it, not one per glyph.
  expect(result.marks).toHaveLength(1);
  const [mark] = result.marks;
  expect(mark!.top).toBeLessThanOrEqual(result.box.top + 1);
  expect(mark!.bottom).toBeGreaterThanOrEqual(result.box.bottom - 1);
  expect(mark!.left).toBeLessThanOrEqual(result.box.left + 1);
  expect(mark!.right).toBeGreaterThanOrEqual(result.box.right - 1);
  await page.mouse.up();
});

test("a partial selection across bidirectional text keeps disjoint runs apart", async ({
  page,
}) => {
  await page.setViewportSize({ width: 900, height: 600 });
  const text = "abc שלום עולם def";
  await open(page, `${text}\nnext\n`);
  // From inside the first Hebrew word to the end of "def" (no break): in
  // visual order this is two runs with unselected Hebrew between them.
  const from = text.indexOf("לום");
  await page.evaluate(
    ([anchor, head]) => {
      const view = [...window.harness.views[0]!.plugins].find(
        (fiber) => fiber.definition.name === "livePreview",
      )!.context!.editor.view;
      view.dispatch({ selection: { anchor: anchor!, head: head! } });
    },
    [from, text.length],
  );
  await page.waitForTimeout(150);
  const result = await page
    .locator(".cm-content > .cm-line")
    .first()
    .evaluate((line, start) => {
      const node = line.firstChild as Text;
      const range = document.createRange();
      range.setStart(node, 0);
      range.setEnd(node, start);
      // "abc ש": its glyph boxes; the Hebrew part is the unselected letter.
      const unselected = [...range.getClientRects()].filter((r) => r.width > 0);
      const box = line.getBoundingClientRect();
      const marks = [
        ...document.querySelectorAll(
          ".mw-selection-layer .cm-selectionBackground",
        ),
      ]
        .map((m) => m.getBoundingClientRect())
        .filter((r) => {
          const mid = (r.top + r.bottom) / 2;
          return mid > box.top && mid < box.bottom && r.width > 0;
        });
      const overlap = marks.some((m) =>
        unselected.some((u) => m.left < u.right - 1 && m.right > u.left + 1),
      );
      return { runs: marks.length, overlap };
    }, from);
  expect(result.runs, "disjoint runs").toBeGreaterThanOrEqual(2);
  expect(result.overlap, "no tint on unselected text").toBe(false);
});
