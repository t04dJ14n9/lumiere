/**
 * Nested Live Preview widgets below a tall Sources sheet (#100): clicks must
 * land near the matching source, not in empty mapped space.
 */
import { expect, test, type Page } from "@playwright/test";
import { open } from "./harness";

function frontmatter(rowCount: number): string {
  const fields = Array.from(
    { length: rowCount },
    (_, i) => `field${i}: value ${i}`,
  ).join("\n");
  return `---\n${fields}\nsources: plain citation\n---\n`;
}

async function constrain(page: Page) {
  await page.addStyleTag({
    content:
      "#app, #app .cm-editor, #app .cm-scroller { height: 640px !important; max-height: 640px !important; } #app .cm-scroller { overflow: auto !important; }",
  });
  await page.evaluate(() => window.dispatchEvent(new Event("resize")));
}

test("nested callout under tall Sources remains clickable near source", async ({
  page,
}) => {
  const body =
    frontmatter(28) +
    `# H1\n\n> [!note] Outer callout\n> Outer intro\n> > [!warning] Inner callout\n> > Inner body with **bold** text.\n> Outer after\n\nAfter nested callouts.\n\n${Array.from({ length: 15 }, (_, i) => `Para ${i}.`).join("\n\n")}\n`;
  await page.setViewportSize({ width: 1100, height: 760 });
  await open(page, body);
  await constrain(page);
  await page.evaluate(() =>
    window.harness.reveal(window.harness.text.indexOf("After nested")),
  );
  const inner = page.locator(".callout-title").filter({ hasText: "Inner" });
  await expect(inner).toBeVisible();
  await inner.click();
  const head = await page.evaluate(
    async () => (await window.harness.viewState()).head,
  );
  const text = await page.evaluate(() => window.harness.text);
  const at = text.indexOf("[!warning]");
  expect(Math.abs(head - at), `head=${head} at=${at}`).toBeLessThan(120);
});

test("deeply nested task list under tall Sources click lands near source", async ({
  page,
}) => {
  const tasks = [
    "- [ ] Level0 task alpha",
    "  - [ ] Level1 task beta",
    "    - [ ] Level2 task gamma",
    "      - [ ] Level3 task delta TARGET",
    "        - [ ] Level4 task epsilon",
  ].join("\n");
  const body =
    frontmatter(28) +
    `# H1\n\n${tasks}\n\nAfter tasks paragraph.\n\n${Array.from({ length: 15 }, (_, i) => `Para ${i}.`).join("\n\n")}\n`;
  await page.setViewportSize({ width: 1100, height: 760 });
  await open(page, body);
  await constrain(page);
  await page.evaluate(() =>
    window.harness.reveal(window.harness.text.indexOf("After tasks")),
  );
  const box = page.locator('input[aria-label="Task"]').nth(3);
  await expect(box).toBeVisible();
  await box.click();
  const head = await page.evaluate(
    async () => (await window.harness.viewState()).head,
  );
  const text = await page.evaluate(() => window.harness.text);
  const at = text.indexOf("Level3 task delta");
  expect(Math.abs(head - at), `head=${head} at=${at}`).toBeLessThan(80);
});
