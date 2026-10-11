// Shared helpers for the Vim + table probes. Obsidian 1.14.4 is started with
// --remote-debugging-port=9444 (9333 is used by other tooling on the box).
// Keys are real trusted key events from Input.dispatchKeyEvent (page.keyboard).
import { chromium } from "/workspace/repos/vscode-markdown-workbench/node_modules/@playwright/test/index.mjs";
export async function connect() {
  const browser = await chromium.connectOverCDP("http://127.0.0.1:9444");
  const page = browser
    .contexts()[0]
    .pages()
    .find((p) => p.url().includes("app://"));
  return { browser, page };
}
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Open a fresh note with `text`, live preview, caret at {line,ch}, Vim normal mode. */
export async function setup(page, text, caret) {
  await page.evaluate(
    async ([t, c]) => {
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
      // A different note first, so no table cell editor keeps focus from the previous case.
      let other = app.vault.getAbstractFileByPath("blank.md");
      if (!other) other = await app.vault.create("blank.md", "blank\n");
      await app.workspace.getLeaf(false).openFile(other);
      await sleep(400);
      let f = app.vault.getAbstractFileByPath("probe.md");
      if (!f) f = await app.vault.create("probe.md", t);
      else await app.vault.modify(f, t);
      const leaf = app.workspace.getLeaf(false);
      await leaf.openFile(f, { state: { mode: "source", source: false } });
      await sleep(600);
      const ed = app.workspace.activeEditor.editor;
      ed.setValue(t);
      ed.cm.contentDOM.focus();
      ed.setCursor(c);
      await sleep(500);
    },
    [text, caret],
  );
  await page.keyboard.press("Escape");
  await sleep(150);
  // Normal mode, caret placed again (Escape can move it left by one).
  await page.evaluate((c) => {
    const ed = app.workspace.activeEditor.editor;
    ed.setCursor(c);
  }, caret);
  await sleep(300);
}

export function snap(page) {
  return page.evaluate(() => {
    const ed = app.workspace.activeEditor.editor;
    const modeOf = (vim) =>
      !vim
        ? "?"
        : vim.insertMode
          ? "insert"
          : vim.visualMode
            ? vim.visualBlock
              ? "visual-block"
              : vim.visualLine
                ? "visual-line"
                : "visual"
            : "normal";
    const a = document.activeElement;
    const cellEl = a?.closest?.("td,th");
    let cell = null;
    if (cellEl) {
      const view = a.cmTile?.view;
      const vim = view?.cm?.state?.vim;
      const rowEl = cellEl.parentElement;
      const rows = [...cellEl.closest("table").rows];
      const sel = view?.state.selection.main;
      cell = {
        row: rows.indexOf(rowEl),
        col: [...rowEl.children].indexOf(cellEl),
        text: view?.state.doc.toString(),
        head: sel?.head,
        anchor: sel?.anchor,
        mode: modeOf(vim),
        pending: vim?.inputState
          ? {
              keys: vim.inputState.keyBuffer?.join(""),
              op: vim.inputState.operator,
            }
          : undefined,
      };
    }
    const outerVim = ed.cm.cm?.state?.vim;
    const c = ed.getCursor();
    const s = ed.getCursor("from"),
      e = ed.getCursor("to");
    return {
      cursor: `${c.line}:${c.ch}`,
      selection:
        s.line === e.line && s.ch === e.ch
          ? ""
          : `${s.line}:${s.ch}-${e.line}:${e.ch}`,
      mode: modeOf(outerVim),
      active: a
        ? `${a.tagName}.${(a.className || "").toString().split(" ")[0]}${cellEl ? "(in " + cellEl.tagName + ")" : ""}`
        : null,
      cell,
      doc: ed.getValue(),
      docChanged: ed.getValue() !== window.__probeDoc,
    };
  });
}
export async function press(page, keys) {
  for (const k of keys) {
    await page.keyboard.press(k);
    await sleep(120);
  }
  await sleep(200);
}
export const fmt = (s) => {
  const cell = s.cell;
  const where = cell
    ? `IN-CELL r${cell.row}c${cell.col} "${cell.text}" head=${cell.head}${cell.anchor !== cell.head ? ` anchor=${cell.anchor}` : ""} cellMode=${cell.mode}${cell.pending?.keys || cell.pending?.op ? " pend=" + JSON.stringify(cell.pending) : ""}`
    : `outer active=${s.active}`;
  return `${s.mode.padEnd(7)} src=${s.cursor}${s.selection ? " sel=" + s.selection : ""} | ${where}${s.docChanged ? " [doc rewritten]" : ""}`;
};
