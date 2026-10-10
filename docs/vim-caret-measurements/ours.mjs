// Measures this extension's Vim caret in the real VS Code editor (same profile settings as vscodevim.mjs).
// Usage: node ours.mjs [blinking] [smooth] [vsix-extension-dir]
import { launch } from "./lib.mjs";
import { mkdirSync, writeFileSync } from "node:fs";
import { scenario } from "./scenario.mjs";

const blinking = process.argv[2] ?? "solid";
const smooth = process.argv[3] ?? "off";
const extensions = process.argv[4] ?? "/tmp/vsvim/ext-ours";
const OUT = new URL("./results/", import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
const root = "/tmp/vsvim";
const { page, stop } = await launch({
  root, extensions, workspace: `${root}/ws`, file: `${root}/ws/sample.md`,
  settings: {
    "editor.cursorBlinking": blinking, "editor.cursorSmoothCaretAnimation": smooth,
    "workbench.editorAssociations": { "*.md": "markdownWorkbench.editor" },
    "markdownWorkbench.plugins.vim.enabled": true,
  },
});
const results = { blinking, smooth, offset: { x: 0, y: 0 }, modes: {} };
try {
  let frame;
  for (let i = 0; i < 80 && !frame; i++) {
    await page.waitForTimeout(500);
    for (const f of page.frames()) {
      if (await f.locator(".cm-content").count().catch(() => 0)) { frame = f; break; }
    }
  }
  if (!frame) throw new Error("no workbench webview");
  const box = await (await frame.frameElement()).boundingBox();
  results.offset = { x: box.x, y: box.y };
  await page.waitForTimeout(3000);
  await frame.locator(".cm-content").click({ position: { x: 300, y: 5 } });
  await page.keyboard.press("Escape");
  await page.keyboard.type("gg0");
  await page.waitForTimeout(400);
  const snapshot = () => frame.evaluate(() => {
    const rect = (e) => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; };
    const cursors = [...document.querySelectorAll(".mw-caret-layer .mw-caret")].map((c) => {
      const shape = c.firstElementChild; const s = getComputedStyle(shape); const cs = getComputedStyle(c);
      return { ...rect(c), cls: c.className, bg: s.backgroundColor, color: s.color, shadow: s.boxShadow, text: shape.textContent,
        visibility: getComputedStyle(c.parentElement).visibility, transition: `${cs.transitionProperty} ${cs.transitionDuration} ${cs.transitionTimingFunction}`,
        animation: `${s.animationName} ${s.animationDuration} ${s.animationTimingFunction} ${s.animationIterationCount} ${s.animationDirection}` };
    });
    const sel = [...document.querySelectorAll(".cm-selectionBackground")].map((e) => ({ ...rect(e), bg: getComputedStyle(e).backgroundColor }));
    const ed = document.querySelector(".cm-editor");
    return { editorClass: ed.className, mode: ed.dataset.caretMode, style: ed.dataset.caretStyle, cursors, decorations: [], selection: sel, status: ed.dataset.caretMode };
  });
  const frameBox = async () => (await page.locator("iframe.webview, .webview").first().boundingBox());
  const shot = async (name) => {
    await page.waitForTimeout(350);
    const s = await snapshot();
    results.modes[name] = s;
    await page.screenshot({ path: `${OUT}ours-${blinking}-${name}.png` });
    console.log(name, s.mode, JSON.stringify(s.cursors.map(({ x, y, w, h, bg, color, text }) => ({ x, y, w, h, bg, color, text }))));
  };
  const keys = async (k) => { await page.keyboard.type(k); };
  await scenario({ page, shot, keys });
} finally {
  writeFileSync(`${OUT}ours-${blinking}-${smooth}.json`, JSON.stringify(results, null, 1));
  await stop();
}
