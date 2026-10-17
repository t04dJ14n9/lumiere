import { connect } from "./lib.mjs";
const { browser, page } = await connect();
const W = ".workspace-leaf.mod-active .cm-table-widget";
const TEXT =
  "para\n\n| a | b | c |\n|---|:-:|--:|\n| 1 | 2 | 3 |\n| 4 | 5 | 6 |\n\nafter\n";
const reset = async (t = TEXT) => {
  await page.evaluate(async (t) => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    await app.workspace
      .getLeaf(false)
      .openFile(app.vault.getAbstractFileByPath("Welcome.md"));
    await sleep(500);
    let f = app.vault.getAbstractFileByPath("tb.md");
    if (!f) f = await app.vault.create("tb.md", t);
    else await app.vault.modify(f, t);
    await app.workspace.getLeaf(false).openFile(f);
    await sleep(900);
    app.workspace.activeEditor.editor.setValue(t);
    await sleep(500);
  }, t);
};
const src = () =>
  page.evaluate(async () => {
    await new Promise((r) => setTimeout(r, 700));
    return app.workspace.activeEditor.editor.getValue();
  });
const foc = () =>
  page.evaluate(() => {
    const a = document.activeElement;
    const td = a.closest("td,th");
    if (!td) return a.tagName + "." + a.className;
    const row = td.parentElement;
    return `${td.tagName} r${[...row.parentElement.children].indexOf(row)}${row.parentElement.tagName} c${[...row.children].indexOf(td)} text=${JSON.stringify(td.textContent)} active=${a.tagName}.${a.className}`;
  });
const log = (l, v) =>
  console.log(
    l.padEnd(34),
    typeof v === "string" ? JSON.stringify(v) : JSON.stringify(v),
  );
const cell = (r, c) => `${W} tbody tr:nth-child(${r}) td:nth-child(${c})`;

// drag row handle: row 1 -> below row 2, with stepped mouse moves
const drag = async (fromSel, toSel, dy = 0, dx = 0) => {
  const a = await page.locator(fromSel).boundingBox();
  const b = await page.locator(toSel).boundingBox();
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.waitForTimeout(150);
  await page.mouse.down();
  await page.waitForTimeout(100);
  const tx = b.x + b.width / 2 + dx,
    ty = b.y + b.height / 2 + dy;
  for (let i = 1; i <= 12; i++) {
    await page.mouse.move(
      a.x + a.width / 2 + ((tx - a.x - a.width / 2) * i) / 12,
      a.y + a.height / 2 + ((ty - a.y - a.height / 2) * i) / 12,
    );
    await page.waitForTimeout(30);
  }
  await page.waitForTimeout(150);
  await page.mouse.up();
  await page.waitForTimeout(500);
};
await reset();
await page.click(cell(1, 2));
await page.waitForTimeout(300);
await drag(
  `${W} tbody tr:nth-child(1) td:nth-child(1) .table-row-drag-handle`,
  cell(2, 2),
  6,
);
log(
  "drag row1 -> row2 source",
  (await src()).split("\n").slice(2, 6).join("\n"),
);
log("drag row focus", await foc());
await reset();
await page.click(cell(1, 2));
await page.waitForTimeout(300);
await drag(
  `${W} thead th:nth-child(1) .table-col-drag-handle`,
  `${W} thead th:nth-child(3)`,
  0,
  6,
);
log("drag col a -> c source", (await src()).split("\n").slice(2, 6).join("\n"));
log("drag col focus", await foc());
// grip click selection effect
await reset();
await page.click(cell(1, 2));
await page.waitForTimeout(300);
const h = await page
  .locator(`${W} thead th:nth-child(2) .table-col-drag-handle`)
  .boundingBox();
await page.mouse.move(h.x + h.width / 2, h.y + h.height / 2);
await page.mouse.down();
await page.mouse.up();
await page.waitForTimeout(400);
log("col grip click: focus", await foc());
log(
  "col grip click: selected classes",
  await page.evaluate(
    (w) =>
      [...document.querySelectorAll(w + " *")]
        .filter((e) =>
          /select|active|focus|highlight/.test(e.className?.toString?.() ?? ""),
        )
        .map((e) => e.tagName + "." + e.className)
        .slice(0, 12),
    W,
  ),
);
log(
  "col grip click: selection",
  await page.evaluate(() => [
    String(getSelection()),
    getSelection().rangeCount,
  ]),
);
// native undo: type 3 chars in cell, then Ctrl+Z steps
await reset();
await page.click(cell(1, 1));
await page.keyboard.press("End");
await page.keyboard.type("abc", { delay: 40 });
await page.waitForTimeout(500);
log("typed abc", (await src()).split("\n").slice(2, 5).join("\n"));
await page.keyboard.press("Control+z");
await page.waitForTimeout(500);
log("undo 1", (await src()).split("\n").slice(2, 5).join("\n"));
await page.keyboard.press("Control+z");
await page.waitForTimeout(500);
log("undo 2", (await src()).split("\n").slice(2, 5).join("\n"));
await page.keyboard.press("Control+Shift+z");
await page.waitForTimeout(500);
log("redo 1", (await src()).split("\n").slice(2, 5).join("\n"));
// undo after Tab into next cell and type
await reset();
await page.click(cell(1, 1));
await page.keyboard.press("End");
await page.keyboard.type("A", { delay: 40 });
await page.keyboard.press("Tab");
await page.keyboard.type("B", { delay: 40 });
await page.waitForTimeout(400);
log("A tab B", (await src()).split("\n").slice(2, 5).join("\n"));
await page.keyboard.press("Control+z");
await page.waitForTimeout(500);
log("undo -> ", (await src()).split("\n").slice(2, 5).join("\n"));
log("focus", await foc());
await page.keyboard.press("Control+z");
await page.waitForTimeout(500);
log("undo -> ", (await src()).split("\n").slice(2, 5).join("\n"));
log("focus", await foc());
// undo after adding a row by button
await reset();
await page.click(cell(1, 2));
await page.click(W + " .table-row-btn");
await page.waitForTimeout(500);
await page.keyboard.press("Control+z");
await page.waitForTimeout(500);
log("undo add row", (await src()).split("\n").slice(2, 7).join("\n"));
log("focus", await foc());
// width: CJK / emoji / combining
await reset();
for (const t of ["中文", "😀", "e\u0301", "👨‍👩‍👧", "a\tb"]) {
  await reset();
  await page.click(cell(2, 1));
  await page.keyboard.press("End");
  await page.keyboard.press("Backspace");
  await page.keyboard.insertText(t);
  await page.waitForTimeout(500);
  log(
    "cell text " + JSON.stringify(t),
    (await src()).split("\n").slice(2, 6).join("\n"),
  );
}
await browser.close();
