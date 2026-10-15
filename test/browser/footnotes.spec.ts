import { test, expect } from "@playwright/test";
import { open } from "./harness";

test("a footnote preview near the right edge stays inside the webview", async ({
  page,
}) => {
  await page.setViewportSize({ width: 640, height: 480 });
  const footnote = `[^1]: ${"A long footnote that wraps. ".repeat(12)}`;
  // Fill the first line so the reference sits at its right end.
  await open(page, `x\n\n${footnote}`);
  const room = await page
    .locator(".cm-line")
    .first()
    .evaluate((line) => {
      const range = document.createRange();
      range.selectNodeContents(line.firstChild!);
      const glyph = range.getBoundingClientRect().width;
      const style = getComputedStyle(line);
      const width =
        line.clientWidth -
        parseFloat(style.paddingLeft) -
        parseFloat(style.paddingRight);
      return Math.floor(width / glyph);
    });
  const filler = "x".repeat(Math.max(1, room - 2));
  await open(page, `${filler}[^1]\n\nafter\n\n${footnote}`);
  const reference = page.locator(".cm-line .mw-footnote-ref").first();
  await expect(reference).toHaveText("1");
  const viewport = page.viewportSize()!;
  expect((await reference.boundingBox())!.x).toBeGreaterThan(
    viewport.width * 0.6,
  );
  await reference.hover();
  const preview = reference.locator(".footnote-preview");
  await expect(preview).toBeVisible();
  await expect(preview).toContainText("A long footnote");
  await expect
    .poll(() =>
      preview.evaluate((element) => {
        const box = element.getBoundingClientRect();
        const root = document.documentElement;
        return box.left >= 0 && box.right <= root.clientWidth;
      }),
    )
    .toBe(true);
});

test("a footnote definition whose body is only a link renders its number and link", async ({
  page,
}) => {
  await open(
    page,
    [
      "See the overview.[^overview]",
      "",
      "[^overview]: [伽利略概述](https://example.com/overview)",
      "",
      "after",
    ].join("\n"),
  );
  const reference = page.locator(".cm-line .mw-footnote-ref").first();
  await expect(reference).toHaveText("1");
  const definition = page.locator(".cm-line.mw-footnote-def").first();
  await expect(definition.locator(".mw-footnote-number")).toHaveText("1");
  await expect(definition).not.toContainText("[^overview]");
  await expect(definition.locator(".md-link, a").first()).toContainText(
    "伽利略概述",
  );
});

test("a footnote preview is not clipped by the scroller near a table", async ({
  page,
}) => {
  await page.setViewportSize({ width: 640, height: 480 });
  const body = [
    "Intro with a footnote.[^1]",
    "",
    "| Region | Price |",
    "| --- | --- |",
    "| SG | 1 |",
    "| CN | 2 |",
    "",
    "after",
    "",
    `[^1]: ${"Full footnote body that must remain visible in the hover preview. ".repeat(8)}`,
  ].join("\n");
  await open(page, body);
  const reference = page.locator(".cm-line .mw-footnote-ref").first();
  await reference.hover();
  const preview = page.locator(".footnote-preview");
  await expect(preview).toBeVisible();
  await expect(preview).toContainText("Full footnote body");
  await expect(preview).toHaveCSS("position", "fixed");
  const fullyVisible = await preview.evaluate((element) => {
    const box = element.getBoundingClientRect();
    const sample = document.elementFromPoint(
      box.left + Math.min(24, box.width / 2),
      box.top + Math.min(24, box.height / 2),
    );
    return (
      box.height > 40 &&
      box.bottom <= document.documentElement.clientHeight &&
      Boolean(sample) &&
      (sample === element || element.contains(sample))
    );
  });
  expect(fullyVisible).toBe(true);
});
