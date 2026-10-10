// Blink and smooth-movement timing of VSCodeVim's caret (the built-in editor's caret in Vim modes).
import { launch } from "./lib.mjs";
const extensions = process.argv[2] ?? "/tmp/vsvim/ext-ours";
import { mkdirSync, writeFileSync } from "node:fs";
const OUT = new URL("./results/", import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
const root = "/tmp/vsvim";
const out = { blink: {}, move: {} };
const { page, stop } = await launch({
  root,
  extensions,
  workspace: `${root}/ws`,
  file: `${root}/ws/sample.md`,
  settings: {
    "editor.cursorBlinking": "blink",
    "editor.cursorSmoothCaretAnimation": "off",
    "workbench.editorAssociations": { "*.md": "markdownWorkbench.editor" },
    "markdownWorkbench.plugins.vim.enabled": true,
  },
});
let frame;
const setSettings = async (extra) => {
  // Live: the profile's settings.json is watched.
  const fs = await import("node:fs");
  const p = `${root}/ud/User/settings.json`;
  const cur = JSON.parse(fs.readFileSync(p, "utf8"));
  fs.writeFileSync(p, JSON.stringify({ ...cur, ...extra }, null, 1));
  await page.waitForTimeout(1500);
};
const sample = (ms) =>
  frame.evaluate(
    (ms) =>
      new Promise((resolve) => {
        const layer = document.querySelector(".mw-caret-layer");
        const cur = () => layer.querySelector(".mw-caret");
        const t0 = performance.now();
        const rows = [];
        const tick = () => {
          const c = cur();
          const sh = c.firstElementChild;
          const s = {
            visibility: getComputedStyle(layer).visibility,
            opacity: getComputedStyle(sh).opacity,
            transform: getComputedStyle(sh).transform,
          };
          const ls = { opacity: 1 };
          const r = c.getBoundingClientRect();
          rows.push([
            Math.round(performance.now() - t0),
            s.visibility,
            +(+s.opacity).toFixed(3),
            +r.x.toFixed(2),
            +r.width.toFixed(2),
            s.transform === "none" ? "" : s.transform,
            +(+ls.opacity).toFixed(3),
          ]);
          if (performance.now() - t0 < ms) requestAnimationFrame(tick);
          else resolve(rows);
        };
        tick();
      }),
    ms,
  );
const summarize = (rows) => {
  // Runs of identical (visibility, opacity>0.5) states: durations in ms.
  const runs = [];
  let prev = null;
  let start = 0;
  for (const [t, vis, op, , , , lop] of rows) {
    const on = vis === "visible" && op * lop > 0.5;
    if (on !== prev) {
      if (prev !== null) runs.push([prev ? "on" : "off", t - start]);
      prev = on;
      start = t;
    }
  }
  const opacities = [...new Set(rows.map((r) => r[2]))].length;
  return {
    runs,
    distinctOpacities: opacities,
    sampleCount: rows.length,
    last: rows.at(-1),
  };
};
try {
  for (let i = 0; i < 80 && !frame; i++) {
    await page.waitForTimeout(500);
    for (const f of page.frames()) {
      if (
        await f
          .locator(".cm-content")
          .count()
          .catch(() => 0)
      ) {
        frame = f;
        break;
      }
    }
  }
  await page.waitForTimeout(3000);
  await frame.locator(".cm-content").click({ position: { x: 300, y: 5 } });
  await page.keyboard.press("Escape");
  await page.keyboard.type("gg0");
  for (const blinking of ["blink", "smooth", "phase", "expand", "solid"]) {
    await setSettings({ "editor.cursorBlinking": blinking });
    await page.keyboard.type("0"); // restarts the blink
    const rows = await sample(7000);
    out.blink[blinking] = {
      ...summarize(rows),
      head: rows.slice(0, 3),
      anim: await frame.evaluate(() => {
        const s = getComputedStyle(document.querySelector(".mw-caret-shape"));
        return {
          cursor: `${s.animationName} ${s.animationDuration} ${s.animationTimingFunction} ${s.animationIterationCount} ${s.animationDirection}`,
        };
      }),
    };
    if (blinking !== "solid")
      out.blink[blinking].samples = rows
        .filter((_, i) => i % 15 === 0)
        .slice(0, 60);
    console.log(
      blinking,
      JSON.stringify(out.blink[blinking].runs.slice(0, 12)),
      JSON.stringify(out.blink[blinking].anim),
    );
  }
  await setSettings({ "editor.cursorBlinking": "solid" });
  for (const smooth of ["off", "explicit", "on"]) {
    await setSettings({ "editor.cursorSmoothCaretAnimation": smooth });
    await page.keyboard.type("0");
    await page.waitForTimeout(500);
    const pending = sample(600);
    await page.keyboard.type("l");
    const rows = await pending;
    const moves = rows.filter((r, i) => i === 0 || r[3] !== rows[i - 1][3]);
    out.move[smooth] = {
      moves,
      transition: await frame.evaluate(() => {
        const s = getComputedStyle(document.querySelector(".mw-caret"));
        return `${s.transitionProperty} ${s.transitionDuration} ${s.transitionTimingFunction}`;
      }),
    };
    // A longer jump (line down, 'G') and a 'j'.
    await page.keyboard.type("gg0");
    await page.waitForTimeout(400);
    const pend2 = sample(600);
    await page.keyboard.type("$");
    const rows2 = await pend2;
    out.move[smooth].jump = rows2.filter(
      (r, i) => i === 0 || r[3] !== rows2[i - 1][3],
    );
    console.log(
      "move",
      smooth,
      out.move[smooth].transition,
      JSON.stringify(out.move[smooth].moves),
      "| $:",
      JSON.stringify(out.move[smooth].jump.slice(0, 12)),
    );
    // Insert-mode typing movement
    await page.keyboard.type("0i");
    await page.waitForTimeout(400);
    const pend3 = sample(500);
    await page.keyboard.type("ab", { delay: 0 });
    const rows3 = await pend3;
    out.move[smooth].typing = rows3.filter(
      (r, i) => i === 0 || r[3] !== rows3[i - 1][3],
    );
    await page.keyboard.press("Escape");
    await page.keyboard.type("uu");
    console.log("typing", smooth, JSON.stringify(out.move[smooth].typing));
  }
} finally {
  writeFileSync(`${OUT}ours-timing.json`, JSON.stringify(out, null, 1));
  await stop();
}
