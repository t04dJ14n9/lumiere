import { expect, test, type Page } from "@playwright/test";
import { open } from "./harness";

function note(rowCount: number): string {
  const fields = Array.from(
    { length: rowCount },
    (_, i) => `field${i}: value ${i}`,
  ).join("\n");
  return `---\n${fields}\nsources: plain citation\n---\n# H1\n\n> [!note] Callout title\n> Callout body line with **bold** text.\n\nAfter callout paragraph.\n\n$E=mc^2$\n\nFinal line.\n`;
}

async function constrain(page: Page) {
  await page.addStyleTag({
    content:
      "#app, #app .cm-editor, #app .cm-scroller { height: 640px !important; max-height: 640px !important; } #app .cm-scroller { overflow: auto !important; }",
  });
  await page.evaluate(() => window.dispatchEvent(new Event("resize")));
}

test("click callout title under tall Sources lands near the callout source", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1100, height: 760 });
  await open(page, note(30));
  await constrain(page);
  await page.evaluate(() =>
    window.harness.reveal(window.harness.text.indexOf("After callout")),
  );
  await expect(page.locator(".callout-title")).toBeVisible();
  await page.locator(".callout-title").click();
  const head = await page.evaluate(
    async () => (await window.harness.viewState()).head,
  );
  const text = await page.evaluate(() => window.harness.text);
  const at = text.indexOf("[!note]");
  expect(Math.abs(head - at)).toBeLessThan(100);
});

test("click inline math under tall Sources lands on the math source", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1100, height: 760 });
  await open(page, note(30));
  await constrain(page);
  // Keep caret off the math so the widget stays rendered.
  await page.evaluate(() =>
    window.harness.reveal(window.harness.text.indexOf("Final line")),
  );
  const math = page.locator("mjx-container, .katex").first();
  await expect(math).toBeVisible();
  await math.click();
  const head = await page.evaluate(
    async () => (await window.harness.viewState()).head,
  );
  const text = await page.evaluate(() => window.harness.text);
  const mathAt = text.indexOf("$E=mc");
  expect(Math.abs(head - mathAt)).toBeLessThan(40);
});
