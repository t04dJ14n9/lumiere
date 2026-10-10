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

const cdp = await page.context().newCDPSession(page);
await reset();
await page.click(cell(2, 1));
await page.keyboard.press("End");
await page.waitForTimeout(300);
const rows = async () => (await src()).split("\n").slice(2, 6).join("\n");
await cdp.send("Input.imeSetComposition", {
  text: "n",
  selectionStart: 1,
  selectionEnd: 1,
});
await page.waitForTimeout(500);
log("composing n: source", await rows());
log("composing n: focus", await foc());
await cdp.send("Input.imeSetComposition", {
  text: "ni",
  selectionStart: 2,
  selectionEnd: 2,
});
await page.waitForTimeout(500);
log("composing ni: source", await rows());
await cdp.send("Input.insertText", { text: "你" });
await page.waitForTimeout(600);
log("committed: source", await rows());
log("committed: focus", await foc());
await browser.close();
