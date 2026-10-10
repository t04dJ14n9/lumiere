import { chromium } from "/workspace/repos/vscode-markdown-workbench/node_modules/.pnpm/playwright-core@1.60.0/node_modules/playwright-core/index.mjs";
const browser = await chromium.connectOverCDP("http://localhost:9333");
const page =
  browser
    .contexts()[0]
    .pages()
    .find((p) => p.url().includes("app://")) ??
  browser.contexts()[0].pages()[0];
console.log(page.url());
const r = await page.evaluate(async () => {
  const name = "probe-a.md";
  let f = app.vault.getAbstractFileByPath(name);
  const text = "x **bold** y *it* z";
  if (!f) f = await app.vault.create(name, text);
  else await app.vault.modify(f, text);
  await app.workspace.getLeaf(false).openFile(f);
  await new Promise((r) => setTimeout(r, 500));
  const ed = app.workspace.activeEditor.editor;
  const out = [
    app.workspace.activeEditor.getMode?.() +
      " src=" +
      app.workspace.activeEditor.currentMode?.sourceMode,
  ];
  for (let i = 0; i <= text.length; i++) {
    ed.setCursor({ line: 0, ch: i });
    await new Promise((r) => setTimeout(r, 60));
    const line = document.querySelector(
      ".workspace-leaf.mod-active .cm-content .cm-line",
    );
    out.push(
      i +
        " " +
        JSON.stringify(line.innerText) +
        " | " +
        [...line.querySelectorAll(".cm-formatting")]
          .map((e) => getComputedStyle(e).display + ":" + e.textContent)
          .join(","),
    );
  }
  return out;
});
console.log(r.join("\n"));
await browser.close();
