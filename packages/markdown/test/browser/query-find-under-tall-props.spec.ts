/**
 * Regression for Live Preview / find under a tall Sources sheet (#100):
 * - clicking an embedded ```query block must land near its source
 * - Find next for a token below the sheet must select that token, not empty map space
 */
import { expect, test, type Page } from "@playwright/test";
import { open } from "./harness";

function note(sourceCount: number): string {
  const entries = Array.from(
    { length: sourceCount },
    (_, i) => `  - title: S${i}\n    resource: https://ex.com/${i}`,
  ).join("\n");
  return `---\nsources:\n${entries}\n---\n# H1\n\n\`\`\`query\ntag:#fixture\n\`\`\`\n\nAfter query UniqueFindToken paragraph.\n\nFinal line UniqueFindToken again.\n`;
}

async function constrain(page: Page) {
  await page.addStyleTag({
    content:
      "#app, #app .cm-editor, #app .cm-scroller { height: 640px !important; max-height: 640px !important; } #app .cm-scroller { overflow: auto !important; }",
  });
  await page.evaluate(() => window.dispatchEvent(new Event("resize")));
}

test("query widget under tall Sources remains clickable near its source", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1100, height: 760 });
  await open(page, note(28));
  await constrain(page);
  await page.evaluate(() =>
    window.harness.reveal(window.harness.text.indexOf("After query")),
  );
  const query = page.locator(".embedded-search, .hybrid-query").first();
  await expect(query).toBeVisible();
  await query.click();
  const head = await page.evaluate(
    async () => (await window.harness.viewState()).head,
  );
  const text = await page.evaluate(() => window.harness.text);
  const at = text.indexOf("```query");
  expect(Math.abs(head - at)).toBeLessThan(80);
});

test("Find next under tall Sources selects the body token, not empty space", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1100, height: 760 });
  await open(page, note(30));
  await constrain(page);
  // Start at the top (inside tall Sources) so Find must scroll into the body.
  await page.evaluate(() => window.harness.reveal(0));
  await page.keyboard.press("ControlOrMeta+f");
  const find = page.getByRole("textbox", { name: "Find..." });
  await expect(find).toBeFocused();
  await page.keyboard.insertText("UniqueFindToken");
  await expect(page.locator(".mw-find-count")).toContainText("/");
  await page.keyboard.press("Enter");
  const head = await page.evaluate(
    async () => (await window.harness.viewState()).head,
  );
  const text = await page.evaluate(() => window.harness.text);
  const at = text.indexOf("UniqueFindToken");
  expect(at).toBeGreaterThan(0);
  expect(Math.abs(head - at)).toBeLessThan(40);
});
