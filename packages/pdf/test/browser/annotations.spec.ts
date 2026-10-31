import { expect, test, type Page } from "@playwright/test";
import {
  open,
  sendAction,
  pagePoint,
  lastView,
  lastSelection,
  selectText,
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

test("selected annotation deletes with Delete and reports region selection for Copy Link", async ({
  page,
}) => {
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
  // selectAfterCreate: selection should be reported as a region for handoff.
  await expect
    .poll(async () => {
      const selection = await lastSelection(page);
      return selection && typeof selection === "object"
        ? (selection as { kind?: string; page?: number }).kind
        : undefined;
    })
    .toBe("region");
  await page.keyboard.press("Delete");
  await expect.poll(() => highlightMarkCount(page)).toBe(baseline);
});

test("AnnotationLayer is hit-testable only in Annotate mode", async ({
  page,
}) => {
  await open(page, "?toolbar=chrome");
  const pointerEvents = async () =>
    page.evaluate(() => {
      const layer = document.querySelector(
        '.page [class*="annotation"], .page > div',
      );
      // Prefer the EmbedPDF annotation layer node by absolute inset style.
      const nodes = [...document.querySelectorAll(".page *")] as HTMLElement[];
      const ann = nodes.find(
        (el) =>
          el.style.position === "absolute" &&
          el.style.inset === "0px" &&
          (el.style.pointerEvents === "none" ||
            el.style.pointerEvents === "auto"),
      );
      return ann?.style.pointerEvents ?? null;
    });
  await expect.poll(pointerEvents).toBe("none");
  await sendAction(page, { action: "setTool", tool: "annotate" });
  await expect.poll(pointerEvents).toBe("auto");
  await sendAction(page, { action: "setTool", tool: "text" });
  await expect.poll(pointerEvents).toBe("none");
});

test("text tool still selects text while AnnotationLayer is non-hit", async ({
  page,
}) => {
  await open(page, "?toolbar=chrome");
  await sendAction(page, { action: "setTool", tool: "text" });
  const at = await pagePoint(page, 1);
  await selectText(page, at(74, TEXT_MIDLINE), at(205, TEXT_MIDLINE));
  await expect
    .poll(async () => {
      const selection = await lastSelection(page);
      return selection && typeof selection === "object"
        ? (selection as { kind?: string }).kind
        : undefined;
    })
    .toBe("text");
});
