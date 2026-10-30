import { expect, test } from "@playwright/test";
import {
  open,
  sendAction,
  pagePoint,
  lastView,
  TEXT_MIDLINE,
} from "./viewer-support";

test("Annotate mode exposes toolkit and Escape returns to text", async ({
  page,
}) => {
  await open(page, "?toolbar=chrome");
  await sendAction(page, { action: "setTool", tool: "annotate" });
  await expect.poll(() => lastView(page)).toMatchObject({ tool: "annotate" });
  await expect(
    page.getByRole("group", { name: "PDF annotation tools" }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect.poll(() => lastView(page)).toMatchObject({ tool: "text" });
});

test("highlight tool can mark text", async ({ page }) => {
  await open(page, "?toolbar=chrome");
  await sendAction(page, { action: "setTool", tool: "annotate" });
  await sendAction(page, { action: "setAnnotationTool", tool: "highlight" });
  const at = await pagePoint(page, 1);
  await page.mouse.move(...at(74, TEXT_MIDLINE));
  await page.mouse.down();
  await page.mouse.move(...at(205, TEXT_MIDLINE));
  await page.mouse.up();
  await expect
    .poll(async () =>
      page.evaluate(
        () =>
          document.querySelectorAll(
            "[data-annotation-id], .annotation-layer svg, .annotation-layer canvas, [class*='annotation']",
          ).length,
      ),
    )
    .toBeGreaterThan(0);
});

test("annotation undo clears an in-session highlight", async ({ page }) => {
  await open(page, "?toolbar=chrome");
  await sendAction(page, { action: "setTool", tool: "annotate" });
  await sendAction(page, { action: "setAnnotationTool", tool: "highlight" });
  const baseline = await page.evaluate(
    () =>
      document.querySelectorAll(
        "[data-annotation-id], .annotation-layer svg, .annotation-layer canvas",
      ).length,
  );
  const at = await pagePoint(page, 1);
  await page.mouse.move(...at(74, TEXT_MIDLINE));
  await page.mouse.down();
  await page.mouse.move(...at(205, TEXT_MIDLINE));
  await page.mouse.up();
  await expect
    .poll(async () =>
      page.evaluate(
        () =>
          document.querySelectorAll(
            "[data-annotation-id], .annotation-layer svg, .annotation-layer canvas",
          ).length,
      ),
    )
    .toBeGreaterThan(baseline);
  await sendAction(page, { action: "annotationUndo" });
  await expect
    .poll(async () =>
      page.evaluate(
        () =>
          document.querySelectorAll(
            "[data-annotation-id], .annotation-layer svg, .annotation-layer canvas",
          ).length,
      ),
    )
    .toBe(baseline);
});
