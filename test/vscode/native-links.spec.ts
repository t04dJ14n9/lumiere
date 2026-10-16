import { copyFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { paths } from "./state";
import { expect, openFile, pdfViewer, test } from "./workbench";

test("built-in Cmd-click delivers PDF page and region and native Back restores source caret", async ({
  workbench: page,
}) => {
  copyFileSync(
    path.join(paths.workspace, "docs/outline.pdf"),
    path.join(paths.workspace, "docs/目标 space.pdf"),
  );
  writeFileSync(
    path.join(paths.workspace, "NativeLinks.md"),
    "[Nine](<docs/目标 space.pdf#page=9&viewrect=72,130,100,30>)\n\n[Three](docs/%E7%9B%AE%E6%A0%87%20space.pdf#page=3)\n\n[Missing](docs/missing.pdf#page=2)\n",
  );
  await openFile(page, "NativeLinks.md");
  const status = page.locator('[id="status.editor.selection"]');
  const returnedCarets = new Map<number, string>();
  for (const target of [9, 3, 9]) {
    await expect(page.locator(".tab.active")).toContainText("NativeLinks.md");
    const link = page
      .locator(".monaco-editor .detected-link")
      .filter({ hasText: `page=${target}` });
    await expect(link).toHaveCount(1);
    await page.keyboard.up("Meta");
    await page.keyboard.up("Control");
    await link.click({ force: true });
    await expect(status).toContainText(target === 9 ? "Ln 1," : "Ln 3,");
    const beforeClick = await status.innerText();
    await link.click({
      force: true,
      modifiers: [process.platform === "darwin" ? "Meta" : "Control"],
    });
    await expect(page.locator(".tab.active")).toContainText("目标 space.pdf");
    const viewer = await pdfViewer(page);
    if (target === 9) {
      const highlight = viewer.locator(
        '.page[data-page-index="8"] .location-highlight',
      );
      await expect(highlight).toBeVisible();
      const box = await highlight.evaluate((element) => {
        const page = element.closest(".page")!.getBoundingClientRect();
        const style = getComputedStyle(element);
        const scale = page.width / 300;
        // CSS content dimensions exclude the highlight's decorative border.
        return [style.left, style.top, style.width, style.height].map(
          (value) => parseFloat(value) / scale,
        );
      });
      for (const [index, value] of [72, 130, 100, 30].entries())
        expect(box[index]).toBeCloseTo(value, 0);
    } else {
      await expect.poll(() => viewer.evaluate((index) => {
        const viewport = document.querySelector(".viewport")!.getBoundingClientRect();
        const page = document.querySelector(`.page[data-page-index="${index}"]`)?.getBoundingClientRect();
        return page ? Math.abs(page.top - viewport.top) : Infinity;
      }, target - 1)).toBeLessThanOrEqual(16);
    }
    await page.getByRole("button", { name: /^Go Back/u }).click();
    await expect(
      page
        .locator(".monaco-editor .detected-link")
        .filter({ hasText: `page=${target}` }),
    ).toBeVisible();
    await expect(status).toContainText(target === 9 ? "Ln 1," : "Ln 3,");
    await expect(status).toHaveText(beforeClick);
    const caret = await status.innerText();
    if (returnedCarets.has(target))
      expect(caret).toBe(returnedCarets.get(target));
    returnedCarets.set(target, caret);
  }
  await page
    .locator(".detected-link")
    .filter({ hasText: "missing.pdf" })
    .click({ modifiers: [process.platform === "darwin" ? "Meta" : "Control"] });
  await expect(page.locator(".notifications-toasts")).toContainText(
    "Could not open precise link",
  );
  await expect(page.locator(".tab.active")).toContainText("NativeLinks.md");
});
