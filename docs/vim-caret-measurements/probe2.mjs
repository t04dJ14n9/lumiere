import { launch } from "./lib.mjs";
const root="/tmp/vsvim";
const { page, stop } = await launch({ root, extensions: `${root}/ext`, workspace: `${root}/ws`, file: `${root}/ws/sample.txt`, settings: {"editor.cursorBlinking":"solid"} });
try {
  const ed = page.locator(".part.editor .monaco-editor").first();
  await ed.locator(".view-lines").waitFor({timeout:30000}); await page.waitForTimeout(5000);
  await ed.locator(".view-lines").click({position:{x:600,y:300}});
  await page.keyboard.press("Escape"); await page.keyboard.type("gg0vlll"); await page.waitForTimeout(500);
  const out = await page.evaluate(() => {
    const cdr=[...document.querySelectorAll(".part.editor .view-overlays *")].filter(e=>/cdr|ced|selected/.test(e.className)).map(e=>{const s=getComputedStyle(e),r=e.getBoundingClientRect();return {cls:e.className,bg:s.backgroundColor,border:s.borderTopWidth+" "+s.borderTopStyle+" "+s.borderTopColor,op:s.opacity,x:r.x,y:r.y,w:r.width,h:r.height,z:s.zIndex}});
    const rules=[]; for (const sh of document.styleSheets) { try { for (const r of sh.cssRules) if (/TextEditorDecorationType9[0-9]/.test(r.cssText)) rules.push(r.cssText); } catch {} }
    return {cdr,rules};
  });
  console.log(JSON.stringify(out,null,1));
} finally { await stop(); }
