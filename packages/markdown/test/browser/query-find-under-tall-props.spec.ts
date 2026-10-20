/**
 * Regression for Live Preview / find under a tall Sources sheet (#100):
 * - clicking an embedded ```query block must land near its source
 * - Find for a token below the sheet must select that token, not empty map space
 *
 * insertText already jumps to match 1; Enter is Find *next* (match 2). Assert
 * the selected text is the token and the caret is near some occurrence — not
 * that Enter re-selects the first hit.
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

test("Find under tall Sources selects a body token, not empty space", async ({
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

  const afterType = await page.evaluate(async () => {
    const vs = await window.harness.viewState();
    const text = window.harness.text;
    const from = Math.min(vs.anchor, vs.head);
    const to = Math.max(vs.anchor, vs.head);
    const first = text.indexOf("UniqueFindToken");
    const second = text.indexOf("UniqueFindToken", first + 1);
    return {
      sel: text.slice(from, to),
      head: vs.head,
      first,
      second,
      near: Math.min(
        Math.abs(vs.head - first),
        Math.abs(vs.head - second),
        Math.abs(vs.anchor - first),
        Math.abs(vs.anchor - second),
      ),
      count: document.querySelector(".mw-find-count")?.textContent ?? "",
    };
  });
  expect(afterType.sel, JSON.stringify(afterType)).toBe("UniqueFindToken");
  expect(afterType.first).toBeGreaterThan(0);
  expect(afterType.near, JSON.stringify(afterType)).toBeLessThan(40);

  // Enter advances Find next (match 2 when match 1 is already current).
  await page.keyboard.press("Enter");
  const afterNext = await page.evaluate(async () => {
    const vs = await window.harness.viewState();
    const text = window.harness.text;
    const from = Math.min(vs.anchor, vs.head);
    const to = Math.max(vs.anchor, vs.head);
    const first = text.indexOf("UniqueFindToken");
    const second = text.indexOf("UniqueFindToken", first + 1);
    return {
      sel: text.slice(from, to),
      head: vs.head,
      first,
      second,
      near: Math.min(
        Math.abs(vs.head - first),
        Math.abs(vs.head - second),
        Math.abs(vs.anchor - first),
        Math.abs(vs.anchor - second),
      ),
      count: document.querySelector(".mw-find-count")?.textContent ?? "",
    };
  });
  expect(afterNext.sel, JSON.stringify(afterNext)).toBe("UniqueFindToken");
  expect(afterNext.near, JSON.stringify(afterNext)).toBeLessThan(40);
  // Prefer that Find next moved off the first hit when two exist.
  if (afterNext.second > afterNext.first) {
    expect(afterNext.count).toMatch(/2\s*\/\s*2/);
    expect(
      Math.min(
        Math.abs(afterNext.head - afterNext.second),
        Math.abs(afterNext.head - (afterNext.second + "UniqueFindToken".length)),
      ),
    ).toBeLessThan(40);
  }
});
