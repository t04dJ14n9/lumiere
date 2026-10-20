/**
 * LP must forward PDF wiki / markdown links with `#page=` and `viewrect`
 * fragments to the host open path (native PDF viewer). Regression for the
 * fragment-preserving follow path covered by unit navigation tests.
 */
import { expect, test, type Page } from "@playwright/test";
import { open } from "./harness";

function sources(n: number): string {
  return Array.from(
    { length: n },
    (_, i) => `  - title: S${i}\n    resource: https://ex.com/${i}`,
  ).join("\n");
}

async function constrain(page: Page) {
  await page.addStyleTag({
    content:
      "#app, #app .cm-editor, #app .cm-scroller { height: 520px !important; max-height: 520px !important; } #app .cm-scroller { overflow: auto !important; }",
  });
  await page.evaluate(() => window.dispatchEvent(new Event("resize")));
}

test("Mod-Enter follows PDF wiki #page= and markdown viewrect fragments", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1100, height: 700 });
  const doc = `See [[paper.pdf#page=3]] and more.\n\nAlso [doc](paper.pdf#page=5&viewrect=1,2,3,4).\n`;
  await open(page, doc);
  await constrain(page);

  await expect(
    page.locator('[data-href="paper.pdf#page=3"]').first(),
  ).toBeVisible();

  await page.evaluate(() =>
    window.harness.reveal(window.harness.text.indexOf("paper.pdf#page=3") + 2),
  );
  await page.keyboard.press("ControlOrMeta+Enter");
  await expect
    .poll(() => page.evaluate(() => window.harness.opened.at(-1)))
    .toBe("paper.pdf#page=3");

  await page.evaluate(() =>
    window.harness.reveal(window.harness.text.indexOf("viewrect") - 5),
  );
  await page.keyboard.press("ControlOrMeta+Enter");
  await expect
    .poll(() => page.evaluate(() => window.harness.opened.at(-1)))
    .toBe("paper.pdf#page=5&viewrect=1,2,3,4");
});

test("click PDF wiki #page= under tall Sources opens with fragment", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1100, height: 760 });
  const doc = `---\nsources:\n${sources(20)}\n---\n# H\n\nOpen [[paper.pdf#page=7]] UniquePdfLink.\n`;
  await open(page, doc);
  await constrain(page);
  await page.evaluate(() =>
    window.harness.reveal(window.harness.text.indexOf("UniquePdfLink")),
  );
  const link = page.locator('[data-href="paper.pdf#page=7"]').first();
  await expect(link).toBeVisible({ timeout: 5000 });
  await link.click();
  await expect
    .poll(() => page.evaluate(() => window.harness.opened.at(-1)))
    .toBe("paper.pdf#page=7");
});
