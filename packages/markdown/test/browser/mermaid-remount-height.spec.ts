/**
 * Short Mermaid fences render tall SVGs. Plain MarkdownBlock line×24
 * estimatedHeight (#109) under-reserves; mermaid-aware factor keeps the
 * height map across off-viewport remounts.
 */
import { expect, test, type Page } from "@playwright/test";
import { open } from "./harness";

const SHORT_TALL_MERMAID = `\`\`\`mermaid
flowchart TB
  A[Start] --> B[Step one with a long label]
  B --> C[Step two with a long label]
  C --> D[Step three]
  D --> E[Step four]
  E --> F[Step five]
  F --> G[End]
\`\`\``;

function note(): string {
  const filler = Array.from(
    { length: 50 },
    (_, i) => `Filler paragraph ${i} scrolls the diagram away.`,
  ).join("\n\n");
  return `# Title\n\n${SHORT_TALL_MERMAID}\n\n${filler}\n`;
}

async function constrain(page: Page) {
  await page.addStyleTag({
    content:
      "#app, #app .cm-editor, #app .cm-scroller { height: 640px !important; max-height: 640px !important; } #app .cm-scroller { overflow: auto !important; }",
  });
  await page.evaluate(() => window.dispatchEvent(new Event("resize")));
}

test("off-viewport mermaid rebuild keeps diagram height in the map", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1100, height: 760 });
  await open(page, note());
  await constrain(page);
  await expect(
    page.locator('[aria-label="Mermaid diagram"], .cm-line').first(),
  ).toBeVisible();
  // Wait for mermaid SVG if rendered
  await page.waitForTimeout(800);

  const result = await page.evaluate(async () => {
    const fiber = [...window.harness.views[0]!.plugins].find(
      (plugin) => plugin.definition.name === "livePreview",
    );
    const view = fiber!.context!.editor.view;
    await new Promise((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(resolve)),
    );
    const from = window.harness.text.indexOf("```mermaid");
    const measured = view.lineBlockAt(from).height;
    const svgH =
      document
        .querySelector('pre[data-fence="mermaid"] svg')
        ?.getBoundingClientRect().height ?? 0;
    window.harness.reveal(window.harness.text.indexOf("Filler paragraph 30"));
    await new Promise((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(resolve)),
    );
    const touchAt = from + 4;
    view.dispatch({ changes: { from: touchAt, to: touchAt, insert: "x" } });
    view.dispatch({ changes: { from: touchAt, to: touchAt + 1, insert: "" } });
    await new Promise((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(resolve)),
    );
    return {
      measured,
      svgH,
      afterRebuild: view.lineBlockAt(from).height,
      inDom: !!document.querySelector('pre[data-fence="mermaid"]'),
    };
  });

  expect(result.measured, JSON.stringify(result)).toBeGreaterThan(80);
  expect(result.afterRebuild, JSON.stringify(result)).toBeGreaterThan(
    result.measured * 0.7,
  );
});

test("scrolling a rendered Mermaid block out of view and back retains the live section and svg DOM node", async ({
  page,
}) => {
  const longFiller = Array.from(
    { length: 160 },
    (_, i) => `Filler paragraph ${i} scrolls the diagram far out of view.`,
  ).join("\n\n");
  await page.setViewportSize({ width: 1100, height: 760 });
  await open(page, `# Title\n\n${SHORT_TALL_MERMAID}\n\n${longFiller}\n`);
  await constrain(page);
  await expect(
    page
      .locator('pre[data-fence="mermaid"][aria-label="Mermaid diagram"] svg')
      .first(),
  ).toBeVisible({ timeout: 10000 });

  const retention = await page.evaluate(async () => {
    const firstSvg = document.querySelector<SVGElement>(
      'pre[data-fence="mermaid"] svg',
    );
    const firstSection = firstSvg?.closest<HTMLElement>("section.hybrid-block");
    if (!firstSection || !firstSvg) {
      return {
        hadInitial: false,
        exitedViewport: false,
        sameSection: false,
        sameSvg: false,
      };
    }
    window.harness.reveal(window.harness.text.indexOf("Filler paragraph 150"));
    await new Promise((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(resolve)),
    );
    const exitedViewport = !firstSection.isConnected;

    window.harness.reveal(0);
    await new Promise((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(resolve)),
    );
    const remountedSvg = document.querySelector<SVGElement>(
      'pre[data-fence="mermaid"] svg',
    );
    const remountedSection = remountedSvg?.closest<HTMLElement>(
      "section.hybrid-block",
    );
    return {
      hadInitial: true,
      exitedViewport,
      sameSection: remountedSection === firstSection,
      sameSvg: remountedSvg === firstSvg,
    };
  });

  expect(retention).toEqual({
    hadInitial: true,
    exitedViewport: true,
    sameSection: true,
    sameSvg: true,
  });
});
