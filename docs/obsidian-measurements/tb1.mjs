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
    await new Promise((r) => setTimeout(r, 700));
    return await app.vault.read(app.vault.getAbstractFileByPath("tb.md"));
  });
const foc = () =>
  page.evaluate(() => {
    const a = document.activeElement;
    const td = a.closest("td,th");
    if (!td) return a.tagName + "." + a.className;
    const row = td.parentElement;
    return `${td.tagName} r${[...row.parentElement.children].indexOf(row)}${row.parentElement.tagName} c${[...row.children].indexOf(td)} text=${JSON.stringify(td.textContent)} cls=${a.className}`;
  });
console.log(
  await page
    .evaluate(() =>
      document
        .querySelector(".workspace-leaf.mod-active .cm-table-widget")
        .outerHTML.replace(/<svg[\s\S]*?<\/svg>/g, "{svg}")
        .replace(/></g, ">\n<"),
    )
    .then((s) => s.slice(0, 3500)),
);
await browser.close();
