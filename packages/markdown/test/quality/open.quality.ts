/**
 * Opening speed in the webview: how soon a note paints after the page
 * starts, and how soon every feature has loaded after that.
 */
import { expect, test } from "@playwright/test";
import { mermaidNote } from "../support/mermaid-note";
import { note as blocksNote } from "../support/perf-note";
import { budgets, record } from "./budgets";
import { browserFactor, openNote } from "./page";

const notes = {
  small: () => blocksNote(24),
  large: () => blocksNote(16_000),
  diagrams: () => mermaidNote(10),
} as const;

for (const [name, source] of Object.entries(notes) as [
  keyof typeof notes,
  () => string,
][]) {
  test(`a ${name} note paints soon after it opens`, async ({ page }) => {
    const opened = await openNote(page, source());
    const factor = await browserFactor(page);
    const featuresAfterPaint = opened.features - opened.firstPaint;
    record("open", { note: name, ...opened, featuresAfterPaint, factor });
    expect(opened.firstPaint).toBeLessThanOrEqual(
      budgets.firstPaintMs[name] * factor,
    );
    expect(featuresAfterPaint).toBeLessThanOrEqual(
      budgets.featuresAfterPaintMs * factor,
    );
  });
}
