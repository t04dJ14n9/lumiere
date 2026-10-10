import { launch } from "./lib.mjs";
import { writeFileSync, readFileSync } from "node:fs";
const root="/tmp/vsvim";
const { page, stop } = await launch({ root, extensions: `${root}/ext`, workspace: `${root}/ws`, file: `${root}/ws/sample.txt`, settings: {"editor.cursorBlinking":"blink"} });
const setSettings = async (extra) => { const p=`${root}/ud/User/settings.json`; writeFileSync(p, JSON.stringify({...JSON.parse(readFileSync(p,"utf8")),...extra})); await page.waitForTimeout(1500); };
try {
  const ed = page.locator(".part.editor .monaco-editor").first();
  await ed.locator(".view-lines").waitFor({timeout:30000}); await page.waitForTimeout(5000);
  await ed.locator(".view-lines").click({position:{x:600,y:300}});
  await page.keyboard.press("Escape"); await page.keyboard.type("gg0");
  const rules = await page.evaluate(() => { const r=[]; for (const sh of document.styleSheets) { try { for (const x of sh.cssRules) if (/monaco-cursor|cursor-(smooth|phase|expand|solid|blink|line|block|underline)|smooth-caret/.test(x.cssText)) r.push(x.cssText.replace(/\s+/g," ")); } catch {} } return r; });
  console.log(rules.join("\n"));
  for (const b of ["blink","smooth"]) {
    await setSettings({"editor.cursorBlinking":b}); await page.keyboard.type("0");
    const rows = await page.evaluate(() => new Promise(res => { const ed=document.querySelector(".part.editor .monaco-editor"); const c=ed.querySelector(".cursors-layer .cursor"), l=ed.querySelector(".cursors-layer"); const t0=performance.now(); const rows=[]; const f=()=>{ const t=performance.now()-t0; rows.push([Math.round(t), getComputedStyle(c).visibility, +getComputedStyle(l).opacity]); t<14000?requestAnimationFrame(f):res(rows)}; f(); }));
    // transitions in 1s buckets of visible fraction
    const buckets=[]; for (let s=0;s<14;s++){ const rs=rows.filter(r=>r[0]>=s*1000&&r[0]<(s+1)*1000); buckets.push(+(rs.filter(r=>r[1]==="visible"&&r[2]>0.5).length/rs.length).toFixed(2)); }
    console.log(b, "visible fraction per second:", JSON.stringify(buckets));
    // opacity curve for smooth over first 1s
    if (b==="smooth") console.log(JSON.stringify(rows.filter((r,i)=>r[0]<1100 && i%4==0).map(r=>[r[0],r[2]])));
  }
} finally { await stop(); }
