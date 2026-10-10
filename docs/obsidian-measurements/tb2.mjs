import { connect } from "./lib.mjs";
const { browser, page } = await connect();
const text =
  "para\n\n| a | b | c |\n|---|:-:|--:|\n| 1 | 2 | 3 |\n| 4 | 5 | 6 |\n\nafter\n";
await page.evaluate(async (t) => {
  let f = app.vault.getAbstractFileByPath("tb.md");
  if (!f) f = await app.vault.create("tb.md", t);
  else await app.vault.modify(f, t);
  await app.workspace.getLeaf(false).openFile(f);
  await new Promise((r) => setTimeout(r, 800));
}, text);
const src = () =>
  page.evaluate(async () => {
    await new Promise((r) => setTimeout(r, 900));
    return JSON.stringify(
      (await app.vault.read(app.vault.getAbstractFileByPath("tb.md")))
        .split("\n")
        .slice(2, 9)
        .join("\n"),
    );
  });
const foc = () =>
  page.evaluate(() => {
    const a = document.activeElement;
    const td = a.closest("td,th");
    if (!td)
      return (
        a.tagName +
        "." +
        a.className.slice(0, 40) +
        " " +
        JSON.stringify(a.textContent?.slice(0, 30))
      );
    const row = td.parentElement;
    const sec = row.parentElement.tagName;
    return `${sec} r${[...row.parentElement.children].indexOf(row)} c${[...row.children].indexOf(td)} ${JSON.stringify(td.textContent)} ed=${a.isContentEditable}`;
  });
const K = async (k, l) => {
  await page.keyboard.press(k);
  await page.waitForTimeout(250);
  console.log((l ?? k).padEnd(26), await foc());
};
const W = ".workspace-leaf.mod-active .cm-table-widget";
await page.click(W + " tbody tr:nth-child(1) td:nth-child(1)");
console.log("click cell(1,1)".padEnd(26), await foc());
await K("Tab");
await K("Tab");
await K("Tab", "Tab (row end)");
await K("Tab");
await K("Tab");
await K("Tab", "Tab (last cell)");
console.log(
  "rows now:",
  await page.evaluate(
    () =>
      document.querySelectorAll(
        ".workspace-leaf.mod-active .cm-table-widget tbody tr",
      ).length,
  ),
  await src(),
);
await K("Shift+Tab");
await K("Shift+Tab");
await K("Shift+Tab");
await K("Enter", "Enter");
console.log(await src());
await K("Enter", "Enter again");
await K("ArrowDown");
await K("ArrowUp");
await K("ArrowRight", "ArrowRight");
await K("ArrowLeft");
await K("Escape", "Escape");
console.log(
  "caret in doc:",
  await page.evaluate(() =>
    JSON.stringify(app.workspace.activeEditor.editor.getCursor()),
  ),
);
// typing + pipe
await page.click(W + " tbody tr:nth-child(1) td:nth-child(1)");
await page.keyboard.press("Control+a");
await page.keyboard.type("x|y\\z", { delay: 30 });
await K("Tab", "type x|y\\z, Tab");
console.log(await src());
await page.click(W + " tbody tr:nth-child(1) td:nth-child(2)");
await page.keyboard.press("Control+a");
await page.keyboard.type("**b** `c|d`", { delay: 30 });
await page.keyboard.press("Shift+Enter");
await page.keyboard.type("two", { delay: 30 });
await K("Tab", "Shift+Enter then Tab");
console.log(await src());
await browser.close();
