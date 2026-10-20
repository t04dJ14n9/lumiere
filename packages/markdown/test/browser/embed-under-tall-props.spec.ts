import { expect, test, type Page } from "@playwright/test";
import { open } from "./harness";

function note(sourceCount: number): string {
  const entries = Array.from(
    { length: sourceCount },
    (_, i) => `  - title: S${i}\n    resource: https://ex.com/${i}`,
  ).join("\n");
  return `---\nsources:\n${entries}\n---\n# H1\n\n![[missing-note]]\n\nAfter embed paragraph with enough text to scroll.\n\n${Array.from({ length: 20 }, (_, i) => `Para ${i}.`).join("\n\n")}\n`;
}

async function constrain(page: Page) {
  await page.addStyleTag({
    content:
      "#app, #app .cm-editor, #app .cm-scroller { height: 640px !important; max-height: 640px !important; } #app .cm-scroller { overflow: auto !important; }",
  });
  await page.evaluate(() => window.dispatchEvent(new Event("resize")));
}

test("embed widget under tall Sources remains clickable near its source", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1100, height: 760 });
  await open(page, note(28));
  await constrain(page);
  await page.evaluate(() =>
    window.harness.reveal(window.harness.text.indexOf("After embed")),
  );
  const embed = page
    .locator(".hybrid-embed, .internal-embed, .file-embed")
    .first();
  await expect(embed).toBeVisible();
  await embed.click();
  const head = await page.evaluate(
    async () => (await window.harness.viewState()).head,
  );
  const text = await page.evaluate(() => window.harness.text);
  const at = text.indexOf("![[missing-note]]");
  expect(Math.abs(head - at)).toBeLessThan(80);
});
