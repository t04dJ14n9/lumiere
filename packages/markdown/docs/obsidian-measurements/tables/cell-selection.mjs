// What Obsidian 1.14 draws for the cell being edited, with text selected in
// it and with several cells selected. Run from this directory with Obsidian
// started by the probe setup (see README.md); writes screenshots to argv[2].
import { connect } from "./lib.mjs";

const out = process.argv[2] ?? ".";
const { browser, page } = await connect();
await page.bringToFront();
const shoot = async (path) => {
  const area = await page
    .locator(".markdown-source-view table")
    .first()
    .boundingBox();
  await page.screenshot({
    path,
    clip: {
      x: area.x - 24,
      y: area.y - 24,
      width: area.width + 48,
      height: area.height + 48,
    },
  });
};
await page.evaluate(async () => {
  await app.workspace.openLinkText("Table probe.md", "", false, {
    state: { mode: "source", source: false },
  });
});
await page.waitForSelector(".markdown-source-view table td");
await page.waitForTimeout(500);

const styles = () =>
  page.evaluate(() => {
    const pick = (el) => {
      if (!el) return null;
      const s = getComputedStyle(el);
      return {
        tag: el.tagName,
        classes: el.className,
        background: s.backgroundColor,
        boxShadow: s.boxShadow,
        outline: `${s.outlineStyle} ${s.outlineWidth} ${s.outlineColor}`,
        border: `${s.borderTopWidth} ${s.borderTopColor}`,
      };
    };
    const focused = document.activeElement;
    const cell =
      focused?.closest?.("td, th") ??
      document.querySelector(".markdown-source-view td.is-selected");
    const selection = [
      ...document.querySelectorAll(
        ".markdown-source-view table .cm-selectionBackground",
      ),
    ].map((el) => getComputedStyle(el).backgroundColor);
    const nativeSelection = String(getSelection());
    return {
      focused: focused && `${focused.tagName}.${focused.className}`,
      wrapper: pick(cell?.querySelector(".table-cell-wrapper")),
      cell: pick(cell),
      selected: [
        ...document.querySelectorAll(".markdown-source-view td.is-selected"),
      ].length,
      selection,
      nativeSelection,
    };
  });

const target = page.locator(".markdown-source-view table td").nth(1);
const box = await target.boundingBox();
await page.mouse.click(box.x + 12, box.y + box.height / 2);
await page.waitForTimeout(300);
console.log("caret in cell:", JSON.stringify(await styles()));
await page.keyboard.press("Home");
for (let i = 0; i < 10; i++) await page.keyboard.press("Shift+ArrowRight");
await page.waitForTimeout(300);
console.log("text selected in cell:", JSON.stringify(await styles()));
await shoot(`${out}/obsidian-cell-text-selection.png`);

const other = page.locator(".markdown-source-view table td").nth(4);
const end = await other.boundingBox();
await page.mouse.click(box.x + 12, box.y + box.height / 2);
await page.mouse.down();
await page.mouse.move(end.x + end.width / 2, end.y + end.height / 2, {
  steps: 8,
});
await page.mouse.up();
await page.waitForTimeout(300);
console.log("cells selected:", JSON.stringify(await styles()));
await shoot(`${out}/obsidian-cell-range-selection.png`);
await browser.close().catch(() => {});
