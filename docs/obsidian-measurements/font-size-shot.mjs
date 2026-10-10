// Screenshots Obsidian's editor showing a note at a given base font size:
// node font-size-shot.mjs <note.md> <size> <out.png>
import { readFileSync } from "node:fs";
import { connect } from "./lib.mjs";
const [file, size, out] = process.argv.slice(2);
const { browser, page } = await connect();
await page.evaluate(
  async ({ text, size }) => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    app.workspace.leftSplit.collapse();
    app.workspace.rightSplit.collapse();
    app.vault.setConfig("showLineNumber", true);
    app.saveLocalStorage("base-font-size", size);
    app.updateFontSize();
    let note = app.vault.getAbstractFileByPath("font-size-shot.md");
    if (!note) note = await app.vault.create("font-size-shot.md", text);
    else await app.vault.modify(note, text);
    await app.workspace.getLeaf(false).openFile(note);
    await sleep(800);
    // The caret at the end keeps every heading and the table rendered.
    const editor = app.workspace.activeEditor.editor;
    editor.setCursor(editor.lastLine(), 3);
    editor.focus();
    await sleep(500);
    document.querySelector(
      ".workspace-leaf.mod-active .cm-scroller",
    ).scrollTop = 0;
    await sleep(300);
  },
  { text: readFileSync(file, "utf8"), size: Number(size) },
);
await page
  .locator(".workspace-leaf.mod-active .view-content")
  .screenshot({ path: out });
await browser.close();
