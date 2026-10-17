// Line numbers beside other rendered blocks in Obsidian 1.14.4: properties, callout, math, embed.
import { connect } from "./lib.mjs";
const { page } = await connect();
const TEXT =
  "---\ntitle: T\ntags:\n  - a\n---\nIntro\n\n> [!note] Title\n> body one\n> body two\n\n$$\nx^2\n$$\n\nEnd\n";
await page.evaluate(async (t) => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  app.vault.setConfig("showLineNumber", true);
  await app.workspace
    .getLeaf(false)
    .openFile(app.vault.getAbstractFileByPath("Welcome.md"));
  await sleep(400);
  let f = app.vault.getAbstractFileByPath("ln2.md");
  if (!f) f = await app.vault.create("ln2.md", t);
  else await app.vault.modify(f, t);
  await app.workspace.getLeaf(false).openFile(f);
  await sleep(900);
  app.workspace.activeEditor.editor.setValue(t);
  await sleep(500);
  app.workspace.activeEditor.editor.setCursor({ line: 15, ch: 0 });
  await sleep(600);
}, TEXT);
console.log(
  JSON.stringify(
    await page.evaluate(() => {
      const root = document.querySelector(".workspace-leaf.mod-active");
      const r = (e) => {
        const b = e.getBoundingClientRect();
        return `${Math.round(b.y)}+${Math.round(b.height)}`;
      };
      return {
        gutter: [
          ...root.querySelectorAll(".cm-lineNumbers .cm-gutterElement"),
        ].map((g) => `${g.textContent}@${r(g)}`),
        blocks: [...root.querySelectorAll(".cm-content > *")].map(
          (l) => `${l.className.slice(0, 30)}@${r(l)}`,
        ),
        metadata: (() => {
          const m = root.querySelector(".metadata-container");
          return m ? r(m) : null;
        })(),
      };
    }),
    null,
    1,
  ),
);
await page.screenshot({ path: "/tmp/obs-linenumbers-blocks.png" });
process.exit(0);
