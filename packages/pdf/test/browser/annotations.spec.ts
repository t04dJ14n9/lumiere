import { expect, test, type Page } from "@playwright/test";
import {
  open,
  sendAction,
  pagePoint,
  lastView,
  TEXT_MIDLINE,
} from "./viewer-support";

/** EmbedPDF highlight marks use multiply blend rectangles inside the page. */
async function highlightMarkCount(page: Page) {
  return page.evaluate(
    () =>
      document.querySelectorAll(
        '.page [style*="mix-blend-mode: multiply"], .page [style*="mix-blend-mode:multiply"]',
      ).length,
  );
}

test("Annotate mode has no viewer bar and Escape returns to text", async ({
  page,
}) => {
  await open(page, "?toolbar=chrome");
  await sendAction(page, { action: "setTool", tool: "annotate" });
  await expect.poll(() => lastView(page)).toMatchObject({ tool: "annotate" });
  await expect(
    page.getByRole("group", { name: "PDF annotation tools" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("toolbar", { name: "PDF annotation bar" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Annotate", exact: true }),
  ).toHaveCount(0);
  const viewport = (await page.locator(".viewport").boundingBox())!;
  expect(viewport.y).toBe(0);
  await page.keyboard.press("Escape");
  await expect.poll(() => lastView(page)).toMatchObject({ tool: "text" });
});

test("the slim bar does not gain an Annotate control", async ({ page }) => {
  await open(page, "?toolbar=slim");
  await sendAction(page, { action: "setTool", tool: "annotate" });
  await expect.poll(() => lastView(page)).toMatchObject({ tool: "annotate" });
  await expect(
    page.getByRole("toolbar", { name: "PDF toolbar" }).getByRole("button", {
      name: "Annotate",
      exact: true,
    }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("group", { name: "PDF annotation tools" }),
  ).toHaveCount(0);
});

test("highlight tool can mark text", async ({ page }) => {
  await open(page, "?toolbar=chrome");
  await sendAction(page, { action: "setTool", tool: "annotate" });
  await sendAction(page, { action: "setAnnotationTool", tool: "highlight" });
  const baseline = await highlightMarkCount(page);
  const at = await pagePoint(page, 1);
  await page.mouse.move(...at(74, TEXT_MIDLINE));
  await page.mouse.down();
  await page.mouse.move(...at(205, TEXT_MIDLINE), { steps: 10 });
  await page.mouse.up();
  await expect.poll(() => highlightMarkCount(page)).toBeGreaterThan(baseline);
});

test("annotation undo clears an in-session highlight", async ({ page }) => {
  await open(page, "?toolbar=chrome");
  await sendAction(page, { action: "setTool", tool: "annotate" });
  await sendAction(page, { action: "setAnnotationTool", tool: "highlight" });
  const baseline = await highlightMarkCount(page);
  const at = await pagePoint(page, 1);
  await page.mouse.move(...at(74, TEXT_MIDLINE));
  await page.mouse.down();
  await page.mouse.move(...at(205, TEXT_MIDLINE), { steps: 10 });
  await page.mouse.up();
  await expect.poll(() => highlightMarkCount(page)).toBeGreaterThan(baseline);
  await sendAction(page, { action: "annotationUndo" });
  await expect.poll(() => highlightMarkCount(page)).toBe(baseline);
});
