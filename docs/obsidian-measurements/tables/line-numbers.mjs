// Line numbers beside a rendered table in Obsidian 1.14.4 (Settings > Editor > Show line number).
import { connect } from "./lib.mjs";
const { page } = await connect();
const TEXT =
  "# Wider\n\n| Col A | Col B | Col C |\n| --- | --- | --- |\n| pipe | code | bold |\n| row 2 | more | cells |\n\nClick a cell.\nLast line\n";
await page.evaluate(async (t) => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  app.vault.setConfig("showLineNumber", true);
  await app.workspace
    .getLeaf(false)
    .openFile(app.vault.getAbstractFileByPath("Welcome.md"));
  await sleep(400);
  let f = app.vault.getAbstractFileByPath("ln.md");
  if (!f) f = await app.vault.create("ln.md", t);
  else await app.vault.modify(f, t);
  await app.workspace.getLeaf(false).openFile(f);
  await sleep(900);
  app.workspace.activeEditor.editor.setValue(t);
  await sleep(500);
  app.workspace.activeEditor.editor.setCursor({ line: 8, ch: 0 });
  await sleep(500);
}, TEXT);
const dump = () =>
  page.evaluate(() => {
    const root = document.querySelector(".workspace-leaf.mod-active");
    const r = (e) => {
      const b = e.getBoundingClientRect();
      return { y: Math.round(b.y), h: Math.round(b.height) };
    };
    const gutters = [
      ...root.querySelectorAll(".cm-lineNumbers .cm-gutterElement"),
    ].map((g) => ({ n: g.textContent, ...r(g) }));
    const w = root.querySelector(".cm-table-widget");
    const rows = [...root.querySelectorAll(".cm-table-widget tr")].map(r);
    const lines = [
      ...root.querySelectorAll(
        ".cm-content > .cm-line, .cm-content > .cm-embed-block",
      ),
    ].map((l) => ({
      t: l.textContent.slice(0, 18),
      cls: l.className.slice(0, 40),
      ...r(l),
    }));
    return { gutters, widget: w ? r(w) : null, rows, lines };
  });
const d = await dump();
console.log("gutter:", JSON.stringify(d.gutters));
console.log(
  "widget:",
  JSON.stringify(d.widget),
  "rows:",
  JSON.stringify(d.rows),
);
console.log("content blocks:", JSON.stringify(d.lines));
await page.screenshot({ path: "/tmp/obs-linenumbers.png" });
// With the caret inside the table.
await page.click(
  ".workspace-leaf.mod-active .cm-table-widget tbody tr:nth-child(1) td:nth-child(2)",
);
await page.waitForTimeout(500);
const e = await dump();
console.log("in table gutter:", JSON.stringify(e.gutters));
console.log("in table widget:", JSON.stringify(e.widget));
await page.screenshot({ path: "/tmp/obs-linenumbers-focus.png" });
process.exit(0);
