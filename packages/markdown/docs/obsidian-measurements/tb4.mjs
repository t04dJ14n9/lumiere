import { connect } from "./lib.mjs";
const { browser, page } = await connect();
const W = ".workspace-leaf.mod-active .cm-table-widget";
const items = () =>
  page.evaluate(() =>
    [...document.querySelectorAll(".menu")].map((mn) =>
      [...mn.querySelectorAll(".menu-item")]
        .map(
          (m) =>
            (m.className.includes("is-disabled") ? "(dis) " : "") +
            m.querySelector(".menu-item-title")?.textContent +
            (m.querySelector(".menu-item-hotkey")
              ? " {" + m.querySelector(".menu-item-hotkey").textContent + "}"
              : ""),
        )
        .join(" | "),
    ),
  );
await page.evaluate(async () => {
  const f = app.vault.getAbstractFileByPath("tb.md");
  await app.vault.modify(
    f,
    "para\n\n| a | b | c |\n|---|:-:|--:|\n| 1 | 2 | 3 |\n| 4 | 5 | 6 |\n\nafter\n",
  );
  await app.workspace.getLeaf(false).openFile(f);
  await new Promise((r) => setTimeout(r, 800));
});
await page.click(W + " tbody tr:nth-child(1) td:nth-child(2)");
await page.click(W + " tbody tr:nth-child(1) td:nth-child(2)", {
  button: "right",
});
await page.waitForTimeout(300);
for (const sub of ["Row", "Column"]) {
  await page.hover(`.menu .menu-item >> text="${sub}"`);
  await page.waitForTimeout(500);
  const m = await items();
  console.log(sub, JSON.stringify(m[m.length - 1]));
}
await page.keyboard.press("Escape");
await page.keyboard.press("Escape");
// handle via mouse down/up
for (const [name, sel] of [
  ["col handle", W + " thead th:nth-child(2) .table-col-drag-handle"],
  [
    "row handle",
    W + " tbody tr:nth-child(2) td:nth-child(1) .table-row-drag-handle",
  ],
]) {
  await page.click(W + " tbody tr:nth-child(1) td:nth-child(2)");
  await page.waitForTimeout(200);
  const box = await page.locator(sel).boundingBox();
  console.log(name, "box", JSON.stringify(box));
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.up();
  await page.waitForTimeout(500);
  console.log(name, JSON.stringify(await items()));
  await page.keyboard.press("Escape");
  await page.waitForTimeout(200);
}
await browser.close();
