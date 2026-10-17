// Which CSS rules show the add-row / add-column buttons, and when.
import { connect } from "./lib.mjs";
const { page } = await connect();
const W = ".workspace-leaf.mod-active .cm-table-widget";
const rules = await page.evaluate(() => {
  const out = [];
  for (const sheet of document.styleSheets) {
    let list;
    try {
      list = sheet.cssRules;
    } catch {
      continue;
    }
    const walk = (rs) => {
      for (const r of rs) {
        if (r.cssRules && !r.selectorText) walk(r.cssRules);
        else if (
          r.selectorText &&
          /table-(row|col)-btn|table-wrapper|cm-table-widget/.test(
            r.selectorText,
          ) &&
          /opacity|display|visibility|transition|pointer/.test(r.cssText)
        )
          out.push(r.cssText.slice(0, 300));
      }
    };
    walk(list);
  }
  return out;
});
console.log(rules.join("\n"));
const opacity = (k) =>
  page.evaluate(
    ([W, k]) => {
      const b = document.querySelector(W + " .table-" + k + "-btn");
      return (
        getComputedStyle(b).opacity +
        " child:" +
        [...b.children]
          .map(
            (c) =>
              c.tagName + "." + c.className + " " + getComputedStyle(c).opacity,
          )
          .join(",")
      );
    },
    [W, k],
  );
for (const k of ["row", "col"]) {
  const box = await page.locator(W + " .table-" + k + "-btn").boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForTimeout(500);
  console.log(
    "hover " + k + " button",
    await opacity(k),
    "other:",
    await opacity(k === "row" ? "col" : "row"),
  );
  await page.screenshot({ path: `/tmp/obs-hover-${k}.png` });
}
process.exit(0);
