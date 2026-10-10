// Measures VSCodeVim's caret in the real VS Code editor (isolated profile, visible display).
// Usage: node vscodevim.mjs [solid|blink|smooth|phase|expand]  -> writes results to ./results/
import { launch } from "./lib.mjs";
import { mkdirSync, writeFileSync } from "node:fs";
import { scenario } from "./scenario.mjs";

const blinking = process.argv[2] ?? "solid";
const smooth = process.argv[3] ?? "off";
const OUT = new URL("./results/", import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
const root = "/tmp/vsvim";
const { page, stop } = await launch({
  root, extensions: `${root}/ext`, workspace: `${root}/ws`, file: `${root}/ws/sample.txt`,
  settings: { "editor.cursorBlinking": blinking, "editor.cursorSmoothCaretAnimation": smooth },
});
const results = { blinking, smooth, modes: {} };
try {
  const editor = page.locator(".part.editor .monaco-editor").first();
  await editor.locator(".view-lines").waitFor({ timeout: 30000 });
  await page.waitForTimeout(5000);
  await editor.locator(".view-lines").click({ position: { x: 600, y: 300 } });
  await page.keyboard.press("Escape");
  await page.keyboard.type("gg0");
  await page.waitForTimeout(400);

  const snapshot = () => page.evaluate(() => {
    const ed = document.querySelector(".part.editor .monaco-editor");
    const rect = (e) => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; };
    const cursors = [...ed.querySelectorAll(".cursors-layer .cursor")].map((c) => {
      const s = getComputedStyle(c);
      return { ...rect(c), cls: c.className.trim(), bg: s.backgroundColor, color: s.color,
        border: `${s.borderTopWidth} ${s.borderTopStyle} ${s.borderTopColor}`, visibility: s.visibility,
        opacity: s.opacity, text: c.textContent, transition: `${s.transitionProperty} ${s.transitionDuration} ${s.transitionTimingFunction}`,
        animation: `${s.animationName} ${s.animationDuration} ${s.animationTimingFunction} ${s.animationIterationCount}` };
    });
    const layer = ed.querySelector(".cursors-layer");
    const decorations = [];
    for (const span of ed.querySelectorAll(".view-lines span")) {
      const s = getComputedStyle(span);
      if (s.backgroundColor !== "rgba(0, 0, 0, 0)" || (s.borderTopWidth !== "0px" && s.borderTopStyle !== "none")) {
        decorations.push({ ...rect(span), text: span.textContent, cls: span.className, bg: s.backgroundColor, color: s.color, border: `${s.borderTopWidth} ${s.borderTopStyle} ${s.borderTopColor}` });
      }
    }
    const selection = [...ed.querySelectorAll(".selected-text")].map((e) => ({ ...rect(e), bg: getComputedStyle(e).backgroundColor }));
    const lines = [...ed.querySelectorAll(".view-line")].map((l) => ({ ...rect(l), text: l.textContent }));
    return { editorClass: ed.className, layerClass: layer?.className, cursors, decorations, selection, lines,
      status: document.querySelector(".statusbar")?.textContent?.match(/-- [A-Z ()-]+ --/)?.[0] ?? null };
  });

  const shot = async (name) => {
    await page.waitForTimeout(350);
    const s = await snapshot();
    results.modes[name] = s;
    await page.screenshot({ path: `${OUT}vscodevim-${blinking}-${name}.png` });
    console.log(name, s.status, JSON.stringify(s.cursors.filter(c => c.h > 0).map(({x,y,w,h,bg,cls,visibility}) => ({x,y,w,h,bg,cls,visibility}))), "deco:", s.decorations.map(d => `${d.text}@${d.x},${d.y} ${d.w}x${d.h} ${d.bg} ${d.color}`).join(" | "));
  };
  const keys = async (k) => { await page.keyboard.type(k); };

  await scenario({ page, shot, keys });
} finally {
  writeFileSync(`${OUT}vscodevim-${blinking}-${smooth}.json`, JSON.stringify(results, null, 1));
  await stop();
}
