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

await reset();
log("initial", (await src()).split("\n").slice(2, 6).join("\n"));
await page.click(cell(1, 1));
await page.waitForTimeout(600);
log("after click", (await src()).split("\n").slice(2, 6).join("\n"));
await page.keyboard.press("Tab");
await page.waitForTimeout(600);
log("after Tab", (await src()).split("\n").slice(2, 6).join("\n"));
await page.keyboard.type("Z");
await page.waitForTimeout(600);
log("after typing Z", (await src()).split("\n").slice(2, 6).join("\n"));
await page.keyboard.press("Control+z");
await page.waitForTimeout(600);
log("undo1", (await src()).split("\n").slice(2, 6).join("\n"));
await page.keyboard.press("Control+z");
await page.waitForTimeout(600);
log("undo2", (await src()).split("\n").slice(2, 6).join("\n"));
// undo after delete-cell content with backspace run
await reset();
await page.click(cell(1, 1));
await page.keyboard.press("End");
await page.keyboard.type("hello world", { delay: 25 });
await page.waitForTimeout(400);
await page.keyboard.press("Control+z");
await page.waitForTimeout(500);
log("typed 11 chars, undo1", (await src()).split("\n").slice(2, 6).join("\n"));
await browser.close();
