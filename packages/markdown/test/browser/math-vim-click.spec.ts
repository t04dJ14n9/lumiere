/**
 * Vim visual freeze + math click: after selecting an inline formula (visual
 * mode), a single click on a display formula must reveal its source — not a
 * second click. Regresses 955f56ae / Host GUI R5 T1.
 */
import { expect, test } from "@playwright/test";
import { open } from "./harness";

const source = ["Inline $x$ here.", "", "$$", "y^2", "$$", "", "after"].join(
  "\n",
);

test("with Vim on, a display formula reveals on the first click after an inline formula was selected", async ({
  page,
}) => {
  await open(page, source, "obsidian", {
    features: { vim: { enabled: true, config: {} } },
  });

  const editor = page.locator(".cm-editor");
  // MathJax sets aria-label to the TeX; the widget shell has no plain text.
  const inline = page.getByLabel("x", { exact: true });
  const block = page.locator(".hybrid-math");
  const blockSource = page.locator(".cm-line.md-math-source");

  await expect(inline).toBeVisible({ timeout: 15_000 });
  await expect(block).toHaveCount(1);
  await expect(block.getByLabel("y^2", { exact: true })).toBeVisible({
    timeout: 15_000,
  });
  await expect(blockSource).toHaveCount(0);

  await inline.click();
  // Body of $x$ at absolute offsets 8–9.
  await expect
    .poll(() => page.evaluate(() => window.harness.capture()))
    .toMatchObject({ from: 8, to: 9 });
  await expect(editor).toHaveAttribute("data-caret-mode", "visual");

  // Still rendered until the display click moves the visual freeze.
  await expect(blockSource).toHaveCount(0);

  await block.click();
  // Body of $$ y^2 $$ at absolute offsets 21–24.
  await expect
    .poll(() => page.evaluate(() => window.harness.capture()))
    .toMatchObject({ from: 21, to: 24 });
  await expect(blockSource).toHaveCount(3);
  await expect(block).toHaveCount(1);
});
