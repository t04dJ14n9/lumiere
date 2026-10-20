/**
 * A properties sheet replaces the whole frontmatter. CodeMirror's height map
 * uses the widget's estimated height for that block until it is measured, and
 * again when a rebuild leaves the sheet outside the viewport. One line of
 * reserve maps a click on the heading below the sheet many lines too far.
 */
import { expect, test, type Page } from "@playwright/test";
import { open } from "./harness";

const HEADING = "# AI 活动平台上云";

function body(): string {
  return Array.from(
    { length: 40 },
    (_, index) => `Body paragraph ${index} keeps the heading scrollable.`,
  ).join("\n\n");
}

function simpleNote(rows: number): string {
  const properties = Array.from(
    { length: rows },
    (_, index) => `field${index}: value ${index}`,
  ).join("\n");
  return `---\n${properties}\n---\n${HEADING}\n\n${body()}\n`;
}

function sourcesNote(count: number): string {
  const entries = Array.from(
    { length: count },
    (_, index) =>
      `  - title: Source ${index}\n    resource: https://example.com/${index}`,
  ).join("\n");
  return `---\nsources:\n${entries}\ndecision_confirmation: yes\n---\n${HEADING}\n\n${body()}\n`;
}

async function constrain(page: Page) {
  await page.addStyleTag({
    content:
      "#app, #app .cm-editor, #app .cm-scroller { height: 640px !important; max-height: 640px !important; } #app .cm-scroller { overflow: auto !important; }",
  });
  await page.evaluate(() => window.dispatchEvent(new Event("resize")));
}

test("rebuilding a properties sheet keeps its row height before the next measure", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1100, height: 760 });
  await open(page, simpleNote(28));
  await constrain(page);
  await expect(page.locator(".hybrid-properties")).toBeVisible();
  const simple = await reservedHeight(page, "value 0");
  expect(simple.measured).toBeGreaterThan(800);
  expect(Math.abs(simple.reserved - simple.measured)).toBeLessThan(4);

  await open(page, sourcesNote(12));
  await constrain(page);
  await expect(page.locator(".source-row").first()).toBeVisible();
  const sources = await reservedHeight(page, "decision_confirmation");
  expect(sources.reserved, JSON.stringify(sources)).toBeGreaterThan(
    sources.measured * 0.85,
  );
  expect(sources.reserved).toBeLessThan(sources.measured * 1.15);
});

test("clicking a heading below a visible Properties block selects that heading", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1100, height: 760 });
  const source = sourcesNote(12);
  const headingLine = source
    .slice(0, source.indexOf(HEADING))
    .split("\n").length;
  await open(page, source);
  await constrain(page);
  await expect(page.locator(".hybrid-properties")).toBeVisible();
  const before = await page.evaluate(async () => {
    const scroller = document.querySelector(".cm-scroller");
    if (!(scroller instanceof HTMLElement)) {
      throw new Error("scroller missing");
    }
    const frame = () => scroller.getBoundingClientRect();
    const heading = () =>
      [...document.querySelectorAll(".cm-line")].find((line) =>
        line.textContent?.includes("活动平台"),
      );
    const glyph = (line: Element) => {
      const walker = document.createTreeWalker(line, NodeFilter.SHOW_TEXT);
      while (walker.nextNode()) {
        const text = walker.currentNode as Text;
        if (text.data.includes("活")) {
          return text;
        }
      }
      throw new Error(`heading text missing: ${line.textContent}`);
    };
    const current = heading();
    const sheet = document.querySelector(".hybrid-properties");
    if (!current || !(sheet instanceof HTMLElement)) {
      throw new Error("heading or properties missing");
    }
    scroller.scrollTop +=
      current.getBoundingClientRect().top -
      (frame().top + frame().height * 0.45);
    await new Promise((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(resolve)),
    );
    const line = heading();
    if (!line) {
      throw new Error("heading missing after scroll");
    }
    const node = glyph(line);
    const at = node.data.indexOf("活");
    const range = document.createRange();
    range.setStart(node, at);
    range.setEnd(node, at + 1);
    const rect = range.getBoundingClientRect();
    const sheetRect = sheet.getBoundingClientRect();
    return {
      hit: { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 },
      scrollTop: scroller.scrollTop,
      headingOffset: rect.top - frame().top,
      sheetAbove:
        sheetRect.top < rect.top && sheetRect.bottom > frame().top + 8,
    };
  });
  expect(before.sheetAbove).toBe(true);
  expect(before.headingOffset).toBeGreaterThan(80);
  expect(before.headingOffset).toBeLessThan(520);
  await page.mouse.click(before.hit.x, before.hit.y);
  await page.waitForTimeout(120);
  const after = await page.evaluate(() => {
    const scroller = document.querySelector(".cm-scroller");
    const fiber = [...window.harness.views[0]!.plugins].find(
      (plugin) => plugin.definition.name === "livePreview",
    );
    const view = fiber!.context!.editor.view;
    if (!(scroller instanceof HTMLElement)) {
      throw new Error("scroller missing");
    }
    const head = view.state.selection.main.head;
    const line = view.state.doc.lineAt(head);
    return {
      scrollTop: scroller.scrollTop,
      line: line.number,
      text: line.text,
    };
  });
  // 2rem sheet margin (#137) can nudge the glyph hit by one line.
  expect(
    Math.abs(after.line - headingLine),
    JSON.stringify({ after, headingLine }),
  ).toBeLessThanOrEqual(1);
  expect(
    after.text === HEADING ||
      after.text.includes("活动") ||
      after.text.trim() === "",
    JSON.stringify(after),
  ).toBe(true);
  expect(Math.abs(after.scrollTop - before.scrollTop)).toBeLessThan(40);
});

async function reservedHeight(page: Page, needle: string) {
  return page.evaluate((needle) => {
    const sheet = document.querySelector(".hybrid-properties");
    const fiber = [...window.harness.views[0]!.plugins].find(
      (plugin) => plugin.definition.name === "livePreview",
    );
    const view = fiber!.context!.editor.view;
    if (!(sheet instanceof HTMLElement)) {
      throw new Error("properties sheet missing");
    }
    const measured = sheet.getBoundingClientRect().height;
    const at = view.state.doc.toString().indexOf(needle);
    if (at < 0) {
      throw new Error(`marker missing: ${needle}`);
    }
    view.dispatch({
      changes: { from: at, to: at + needle.length, insert: `${needle}x` },
    });
    return {
      measured,
      reserved: view.lineBlockAt(0).height,
      yaml: document
        .querySelector(".metadata-input-yaml")
        ?.getBoundingClientRect().height,
      article: document
        .querySelector(".source-row:not([hidden])")
        ?.getBoundingClientRect().height,
    };
  }, needle);
}
