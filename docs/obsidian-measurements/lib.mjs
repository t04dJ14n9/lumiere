import { chromium } from "playwright-core";
export async function connect() {
  const browser = await chromium.connectOverCDP("http://localhost:9333");
  const page = browser
    .contexts()[0]
    .pages()
    .find((p) => p.url().includes("app://obsidian.md/index.html"));
  return { browser, page };
}
// Observe: for each probe (selection), return visible text of editor.
export async function observe(page, name, text, probes, opts = {}) {
  return page.evaluate(
    async ({ name, text, probes, opts }) => {
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
      let f = app.vault.getAbstractFileByPath(name);
      if (!f) f = await app.vault.create(name, text);
      else await app.vault.modify(f, text);
      const leaf = app.workspace.getLeaf(false);
      await leaf.openFile(f);
      await sleep(400);
      const view = app.workspace.activeEditor;
      const ed = view.editor;
      ed.focus();
      const out = [];
      const root = document.querySelector(
        ".workspace-leaf.mod-active .cm-content",
      );
      for (const p of probes) {
        if (p.sel) ed.setSelection(p.sel[0], p.sel[1]);
        else ed.setCursor(p);
        await sleep(opts.wait ?? 70);
        const vis = (el) => {
          let s = "";
          const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
          let n;
          while ((n = w.nextNode())) {
            let p = n.parentElement,
              hid = false;
            while (p && p !== el.parentElement) {
              if (
                p.classList.contains("cm-transparent") ||
                getComputedStyle(p).display === "none"
              ) {
                hid = true;
                break;
              }
              p = p.parentElement;
            }
            if (!hid) s += n.nodeValue;
          }
          return s;
        };
        const lines = [...root.children].map((l) =>
          l.classList.contains("cm-line")
            ? l.querySelector(".cm-embed-block,.cm-widget,.cm-html-embed")
              ? l.innerText
              : vis(l)
            : "[W:" +
              l.className.replace(/cm-embed-block ?/, "") +
              "] " +
              l.innerText.replace(/\n+/g, " / "),
        );
        out.push({
          p,
          text: root.innerText,
          lines,
          html: opts.html ? root.innerHTML : undefined,
        });
      }
      return out;
    },
    { name, text, probes, opts },
  );
}
export function offsetToPos(text, off) {
  const before = text.slice(0, off).split("\n");
  return { line: before.length - 1, ch: before[before.length - 1].length };
}
