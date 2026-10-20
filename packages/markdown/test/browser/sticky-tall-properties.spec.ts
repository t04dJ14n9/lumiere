/**
 * Sticky scroll must still resolve the heading trail when a tall Sources
 * properties sheet sits above the body (#100 height map).
 */
import { expect, test } from "@playwright/test";
import { open } from "./harness";

function note(sourceCount: number): string {
  const entries = Array.from(
    { length: sourceCount },
    (_, index) =>
      `  - title: Source ${index}\n    resource: https://example.com/${index}`,
  ).join("\n");
  return `---\nsources:\n${entries}\n---\n# Alpha\n\nIntro under alpha.\n\n## Beta\n\n${Array.from({ length: 30 }, (_, i) => `Beta para ${i}.`).join("\n\n")}\n\n## Gamma\n\n${Array.from({ length: 30 }, (_, i) => `Gamma para ${i}.`).join("\n\n")}\n`;
}

test("sticky headings track Beta under a tall Sources sheet", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1100, height: 700 });
  await open(page, note(24), "obsidian", {
    features: { stickyScroll: { enabled: true, config: { maxLines: 5 } } },
  });
  await page.addStyleTag({
    content:
      "#app, #app .cm-editor, #app .cm-scroller { height: 520px !important; max-height: 520px !important; } #app .cm-scroller { overflow: auto !important; }",
  });
  await page.evaluate(() => window.dispatchEvent(new Event("resize")));
  await expect(page.locator(".hybrid-properties")).toBeVisible();
  await page.evaluate(() =>
    window.harness.reveal(window.harness.text.indexOf("Beta para 10")),
  );
  const sticky = page.locator(".mw-sticky-scroll button.mw-sticky-heading");
  await expect(sticky.first()).toBeVisible({ timeout: 5000 });
  const labels = await sticky.allTextContents();
  expect(labels.some((label) => /Beta/i.test(label))).toBeTruthy();
  expect(labels.some((label) => /Alpha/i.test(label))).toBeTruthy();
});
