// Visibility rules of the add-row / add-column buttons: unfocused, hovered, focused.
import { connect } from "./lib.mjs";
const { page } = await connect();
const W = ".workspace-leaf.mod-active .cm-table-widget";
const TEXT =
  "para\n\n| a | b | c |\n|---|:-:|--:|\n| 1 | 2 | 3 |\n| 4 | 5 | 6 |\n\nafter\n";
await page.evaluate(async (t) => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  await app.workspace
    .getLeaf(false)
    .openFile(app.vault.getAbstractFileByPath("Welcome.md"));
  await sleep(500);
  let f = app.vault.getAbstractFileByPath("tb.md");
  if (!f) f = await app.vault.create("tb.md", t);
  await app.workspace.getLeaf(false).openFile(f);
  await sleep(900);
  app.workspace.activeEditor.editor.setValue(t);
  await sleep(600);
}, TEXT);
const state = async (label) => {
  const s = await page.evaluate((W) => {
    const w = document.querySelector(W);
    const t = w.querySelector("table").getBoundingClientRect();
    const out = {
      hasFocus:
        w.querySelector(".table-wrapper")?.classList.contains("has-focus") ||
        w.classList.contains("has-focus"),
    };
    for (const k of ["row", "col"]) {
      const b = w.querySelector(".table-" + k + "-btn");
      const r = b.getBoundingClientRect();
      const c = getComputedStyle(b);
      out[k] = {
        dx: Math.round(r.x - t.x),
        dy: Math.round(r.y - t.y),
        w: Math.round(r.width),
        h: Math.round(r.height),
        opacity: c.opacity,
        pe: c.pointerEvents,
        vis: c.visibility,
        display: c.display,
        label: b.getAttribute("aria-label"),
        tab: b.tabIndex,
        tag: b.tagName,
      };
    }
    out.table = { w: Math.round(t.width), h: Math.round(t.height) };
    return out;
  }, W);
  console.log(label.padEnd(26), JSON.stringify(s));
};
await page.mouse.move(5, 5);
await page.click(".workspace-leaf.mod-active .cm-content >> text=para");
await page.waitForTimeout(400);
await state("unfocused, mouse away");
const t = await page.locator(W + " table").boundingBox();
await page.mouse.move(t.x + t.width / 2, t.y + 5);
await page.waitForTimeout(400);
await state("hover table (no focus)");
await page.screenshot({ path: "/tmp/obs-hover.png" });
await page.click(W + " tbody tr:nth-child(1) td:nth-child(2)");
await page.mouse.move(5, 5);
await page.waitForTimeout(400);
await state("focused cell, mouse away");
await page.screenshot({ path: "/tmp/obs-focus.png" });
await page.mouse.move(t.x + t.width / 2, t.y + 5);
await page.waitForTimeout(400);
await state("focused + hover");
// Keyboard: Tab order to the buttons
await page.evaluate(() => document.activeElement.blur());
process.exit(0);
