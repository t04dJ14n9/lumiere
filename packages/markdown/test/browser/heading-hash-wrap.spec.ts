import { test, expect } from "@playwright/test";
import { open } from "./harness";

test("revealed ATX heading marker stays on the first visual row with the heading text when the heading wraps", async ({
  page,
}) => {
  const doc = [
    "# `very_long_inline_code_identifier_in_heading_alpha_beta_gamma_delta_2026`",
    "",
    "## Service_Error_Chain_With_Long_Unbreakable_Identifier_Token_Alpha_Beta_2026",
    "",
    "Trailing paragraph.",
  ].join("\n");

  await open(page, doc);

  const metrics = await page.evaluate(() => {
    const view = [...window.harness.views[0]!.plugins].find(
      (fiber) => fiber.definition.name === "livePreview",
    )!.context!.editor.view;
    view.focus();

    const measureLine = (lineNumber: number) => {
      const lineInfo = view.state.doc.line(lineNumber);
      view.dispatch({
        selection: { anchor: lineInfo.from + 2, head: lineInfo.from + 2 },
      });
      const lines = view.contentDOM.querySelectorAll<HTMLElement>(
        ".cm-line.md-heading",
      );
      const lineEl = lines[lineNumber === 1 ? 0 : 1]!;
      const markEl = lineEl.querySelector<HTMLElement>(".md-syntax-mark")!;
      const spaceEl = lineEl.querySelector<HTMLElement>(".md-header-space")!;
      const walker = document.createTreeWalker(lineEl, NodeFilter.SHOW_TEXT);
      let firstGlyphRect: DOMRect | null = null;
      while (walker.nextNode()) {
        const node = walker.currentNode as Text;
        const parent = node.parentElement;
        if (
          parent?.classList.contains("md-syntax-mark") ||
          parent?.classList.contains("md-header-space")
        ) {
          continue;
        }
        const match = node.nodeValue?.match(/\S/);
        if (match && match.index !== undefined) {
          const range = document.createRange();
          range.setStart(node, match.index);
          range.setEnd(node, match.index + 1);
          firstGlyphRect = range.getBoundingClientRect();
          break;
        }
      }
      const lineRect = lineEl.getBoundingClientRect();
      const markRect = markEl.getBoundingClientRect();
      return {
        hasHeaderSpace: Boolean(spaceEl),
        lineDisplay: getComputedStyle(lineEl).display,
        markDisplay: getComputedStyle(markEl).display,
        spaceWhiteSpace: getComputedStyle(spaceEl).whiteSpace,
        markTop: markRect.top - lineRect.top,
        glyphTop: firstGlyphRect!.top - lineRect.top,
        glyphLeft: firstGlyphRect!.left - lineRect.left,
        markRight: markRect.right - lineRect.left,
      };
    };

    return {
      h1: measureLine(1),
      h2: measureLine(3),
    };
  });

  expect(metrics.h1.hasHeaderSpace).toBe(true);
  expect(metrics.h1.lineDisplay).toBe("block");
  expect(metrics.h1.markDisplay).toBe("inline");
  expect(metrics.h1.spaceWhiteSpace).toBe("pre");
  expect(Math.abs(metrics.h1.glyphTop - metrics.h1.markTop)).toBeLessThan(8);
  expect(metrics.h1.glyphLeft).toBeGreaterThanOrEqual(metrics.h1.markRight);

  expect(metrics.h2.hasHeaderSpace).toBe(true);
  expect(Math.abs(metrics.h2.glyphTop - metrics.h2.markTop)).toBeLessThan(8);
  expect(metrics.h2.glyphLeft).toBeGreaterThanOrEqual(metrics.h2.markRight);
});

test("empty ATX heading line keeps its # marker visible when unrevealed (Obsidian parity)", async ({
  page,
}) => {
  await open(page, "# \n\nBody paragraph");
  await page.evaluate(() => {
    const view = [...window.harness.views[0]!.plugins].find(
      (fiber) => fiber.definition.name === "livePreview",
    )!.context!.editor.view;
    view.focus();
    const last = view.state.doc.length;
    view.dispatch({ selection: { anchor: last, head: last } });
  });
  const firstHeadingMark = page
    .locator(".cm-line.md-heading")
    .first()
    .locator(".md-syntax-mark");
  await expect(firstHeadingMark).toBeVisible();
  await expect(firstHeadingMark).toHaveText("#");
});
