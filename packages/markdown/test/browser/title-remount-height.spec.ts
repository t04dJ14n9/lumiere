/**
 * Wrapping inline titles are one block widget above the note. Without
 * estimatedHeight, an off-viewport rebuild collapses the height map to one
 * line (~24px) — the same failure mode as tall Properties (#100) and tables
 * (#108).
 */
import { expect, test, type Page } from "@playwright/test";
import { open } from "./harness";

const LONG_TITLE =
  "A very long note title that wraps across several lines when the Live Preview pane is narrow enough";
const LONGER_TITLE =
  "Another equally long replacement title that still wraps for the remount height reserve check path";

function noteWithFiller(): string {
  const filler = Array.from(
    { length: 60 },
    (_, i) => `Filler paragraph ${i} scrolls the inline title away.`,
  ).join("\n\n");
  return `# Heading\n\nFirst body line.\n\n${filler}\n`;
}

async function constrain(page: Page) {
  await page.addStyleTag({
    content:
      "#app, #app .cm-editor, #app .cm-scroller { height: 640px !important; max-height: 640px !important; width: 420px !important; max-width: 420px !important; } #app .cm-scroller { overflow: auto !important; }",
  });
  await page.evaluate(() => window.dispatchEvent(new Event("resize")));
}

test("off-viewport wrapping title rebuild keeps height in the map", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1100, height: 760 });
  await open(page, noteWithFiller(), "obsidian", {
    features: { inlineTitle: { enabled: true, config: {} } },
  });
  await constrain(page);
  await expect(page.locator(".file-title")).toBeVisible();

  const result = await page.evaluate(
    async ({ longTitle, longerTitle }) => {
      window.harness.applyTitle(longTitle);
      const fiber = [...window.harness.views[0]!.plugins].find(
        (plugin) => plugin.definition.name === "livePreview",
      );
      const view = fiber!.context!.editor.view;
      await new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      );
      const measured = view.lineBlockAt(0).height;
      const titleHeight =
        document.querySelector<HTMLElement>(".file-title")?.offsetHeight ?? 0;
      window.harness.reveal(window.harness.text.indexOf("Filler paragraph 40"));
      await new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      );
      // Rebuild the off-screen title decoration with another wrapping value.
      window.harness.applyTitle(longerTitle);
      await new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      );
      return {
        measured,
        titleHeight,
        afterRebuild: view.lineBlockAt(0).height,
        titleInDom: !!document.querySelector(".file-title"),
      };
    },
    { longTitle: LONG_TITLE, longerTitle: LONGER_TITLE },
  );

  expect(result.titleHeight, JSON.stringify(result)).toBeGreaterThan(40);
  expect(result.measured, JSON.stringify(result)).toBeGreaterThan(40);
  // Without estimatedHeight this collapses to one line (~24px).
  expect(result.afterRebuild, JSON.stringify(result)).toBeGreaterThan(
    result.measured * 0.7,
  );
  expect(result.titleInDom).toBe(false);
});

test("PageDown past a remounted wrapping title still paints filler body", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1100, height: 760 });
  await open(page, noteWithFiller(), "obsidian", {
    features: { inlineTitle: { enabled: true, config: {} } },
  });
  await constrain(page);
  await expect(page.locator(".file-title")).toBeVisible();

  await page.evaluate(
    async ({ longTitle, longerTitle }) => {
      window.harness.applyTitle(longTitle);
      const fiber = [...window.harness.views[0]!.plugins].find(
        (plugin) => plugin.definition.name === "livePreview",
      );
      const view = fiber!.context!.editor.view;
      await new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      );
      window.harness.reveal(window.harness.text.indexOf("Filler paragraph 40"));
      await new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      );
      window.harness.applyTitle(longerTitle);
      window.harness.reveal(0);
      await new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      );
      void view;
    },
    { longTitle: LONG_TITLE, longerTitle: LONGER_TITLE },
  );

  await page.keyboard.press("PageDown");
  await page.keyboard.press("PageDown");
  await page.waitForTimeout(100);

  const painted = await page.evaluate(() => {
    const text = document.querySelector(".cm-content")?.textContent ?? "";
    const lines = document.querySelectorAll(".cm-line").length;
    return {
      hasFiller: /Filler paragraph/.test(text),
      hasHeading: /Heading|First body/.test(text),
      lines,
    };
  });
  expect(painted.lines, JSON.stringify(painted)).toBeGreaterThan(3);
  expect(painted.hasFiller || painted.hasHeading).toBe(true);
});
