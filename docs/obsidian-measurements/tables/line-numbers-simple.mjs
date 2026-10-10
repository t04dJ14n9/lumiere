// Gutter numbers around the "Simple" table of sample-vault/notes/02-tables.md (blank line before and after).
import fs from "node:fs";
import { connect } from "./lib.mjs";
const { page } = await connect();
const TEXT = fs.readFileSync(
  process.argv[2] ?? "/workspace/sample-vault/notes/02-tables.md",
  "utf8",
);
await page.evaluate(async (t) => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  app.vault.setConfig("showLineNumber", true);
  await app.workspace
    .getLeaf(false)
    .openFile(app.vault.getAbstractFileByPath("Welcome.md"));
  await sleep(400);
  let f = app.vault.getAbstractFileByPath("ln3.md");
  if (!f) f = await app.vault.create("ln3.md", t);
  else await app.vault.modify(f, t);
  await app.workspace.getLeaf(false).openFile(f);
  await sleep(900);
  app.workspace.activeEditor.editor.setValue(t);
  await sleep(500);
  app.workspace.activeEditor.editor.setCursor({ line: 30, ch: 0 });
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
          (l) =>
            `${(l.textContent || "").slice(0, 10).replace(/\s+/g, " ")}|${l.className.slice(0, 24)}@${r(l)}`,
        ),
      };
    }),
    null,
    1,
  ),
);
await page.screenshot({ path: "/tmp/obs-simple.png" });
process.exit(0);
