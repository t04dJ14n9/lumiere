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

// 1 add row button: real mouse click at button centre after focusing the table
for (const mode of ["page.click", "mouse down/up", "dispatch click"]) {
  await reset();
  await page.click(cell(1, 2));
  await page.waitForTimeout(300);
  const b = await page.locator(W + " .table-row-btn").boundingBox();
  log(mode + " row-btn box", b);
  if (mode === "page.click") await page.click(W + " .table-row-btn");
  else if (mode === "mouse down/up") {
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
    await page.waitForTimeout(150);
    await page.mouse.down();
    await page.waitForTimeout(80);
    await page.mouse.up();
  } else
    await page.evaluate(
      (s) => document.querySelector(s).click(),
      W + " .table-row-btn",
    );
  await page.waitForTimeout(500);
  log(mode + " row-btn focus", await foc());
  log(
    mode + " row-btn source",
    (await src()).split("\n").slice(2, 9).join("\n"),
  );
}
for (const mode of ["page.click", "mouse down/up", "dispatch click"]) {
  await reset();
  await page.click(cell(1, 2));
  await page.waitForTimeout(300);
  await page.hover(W + " thead th:nth-child(3)");
  await page.waitForTimeout(200);
  const b = await page.locator(W + " .table-col-btn").boundingBox();
  log(mode + " col-btn box", b);
  if (mode === "page.click") await page.click(W + " .table-col-btn");
  else if (mode === "mouse down/up") {
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
    await page.waitForTimeout(150);
    await page.mouse.down();
    await page.waitForTimeout(80);
    await page.mouse.up();
  } else
    await page.evaluate(
      (s) => document.querySelector(s).click(),
      W + " .table-col-btn",
    );
  await page.waitForTimeout(500);
  log(mode + " col-btn focus", await foc());
  log(
    mode + " col-btn source",
    (await src()).split("\n").slice(2, 9).join("\n"),
  );
}
// 2 Shift+Enter
await reset();
await page.click(cell(1, 1));
await page.keyboard.press("End");
await page.keyboard.press("Shift+Enter");
await page.keyboard.type("x");
await page.waitForTimeout(400);
log("shift+enter source", (await src()).split("\n").slice(2, 7).join("\n"));
log("shift+enter focus", await foc());
log(
  "shift+enter rendered td",
  await page.evaluate((s) => document.querySelector(s)?.innerHTML, cell(1, 1)),
);
await page.keyboard.press("Tab");
await page.waitForTimeout(300);
log(
  "after tab rendered td",
  await page.evaluate((s) => document.querySelector(s)?.innerHTML, cell(1, 1)),
);
await browser.close();
