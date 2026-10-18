import { expect, test } from "@playwright/test";
import {
  open,
  lastSelection,
  pagePoint,
  selectText,
  drag,
  lastView,
  sendAction,
  TEXT_MIDLINE,
} from "./viewer-support";

test("the Select Region tool selects a region even over text; Escape puts it down", async ({
  page,
}) => {
  await open(page);
  await sendAction(page, { action: "setTool", tool: "region" });
  await expect.poll(() => lastView(page)).toMatchObject({ tool: "region" });
  const at = await pagePoint(page, 1);
  // Over the text, the tool shows a crosshair rather than a text cursor.
  await expect
    .poll(async () => {
      await page.mouse.move(...at(100, TEXT_MIDLINE));
      return page.evaluate(
        ([x, y]) =>
          getComputedStyle(document.elementFromPoint(x, y) as Element).cursor,
        at(100, TEXT_MIDLINE),
      );
    })
    .toBe("crosshair");
  // The drag starts on the text, which would otherwise select text.
  await drag(page, at(74, TEXT_MIDLINE), at(205, 140));
  await expect(
    page.getByRole("toolbar", { name: "PDF region actions" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("toolbar", { name: "PDF text selection actions" }),
  ).toHaveCount(0);
  await expect
    .poll(() => lastSelection(page))
    .toMatchObject({ kind: "region", page: 1 });
  const { rect } = (await lastSelection(page)) as { rect: number[] };
  expect(rect[0]).toBeCloseTo(74, -1);
  expect(rect[1]).toBeCloseTo(TEXT_MIDLINE, -1);

  // A click elsewhere (away from the page's links) clears the region, as it does without the tool.
  await page.mouse.click(...at(20, 300));
  await expect.poll(() => lastSelection(page)).toBeNull();

  // The first Escape clears the region, the second goes back to selecting text.
  await drag(page, at(74, TEXT_MIDLINE), at(205, 140));
  await expect
    .poll(() => lastSelection(page))
    .toMatchObject({ kind: "region", page: 1 });
  await page.keyboard.press("Escape");
  await expect.poll(() => lastSelection(page)).toBeNull();
  await expect.poll(() => lastView(page)).toMatchObject({ tool: "region" });
  await page.keyboard.press("Escape");
  await expect.poll(() => lastView(page)).toMatchObject({ tool: "text" });
  await selectText(page, at(74, TEXT_MIDLINE), at(205, TEXT_MIDLINE));
  await expect
    .poll(() => lastSelection(page))
    .toMatchObject({ kind: "text", text: "Synthetic page 1" });
});

test("switching to the Select Region tool clears a text selection", async ({
  page,
}) => {
  await open(page);
  const at = await pagePoint(page, 1);
  await selectText(page, at(74, TEXT_MIDLINE), at(205, TEXT_MIDLINE));
  await expect
    .poll(() => lastSelection(page))
    .toMatchObject({ kind: "text", text: "Synthetic page 1" });
  await expect(
    page.getByRole("toolbar", { name: "PDF text selection actions" }),
  ).toHaveCount(0);
  await sendAction(page, { action: "setTool", tool: "region" });
  await expect.poll(() => lastSelection(page)).toBeNull();
  await sendAction(page, { action: "setTool", tool: "text" });
  await expect.poll(() => lastView(page)).toMatchObject({ tool: "text" });
});
