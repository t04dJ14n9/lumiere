import { launch } from "./lib.mjs";
const root="/tmp/vsvim";
const { page, stop } = await launch({ root, extensions: `${root}/ext`, workspace: `${root}/ws`, file: `${root}/ws/sample.txt`, settings: {"editor.cursorBlinking":"solid"} });
try {
  const ed = page.locator(".part.editor .monaco-editor").first();
  await ed.locator(".view-lines").waitFor({timeout:30000}); await page.waitForTimeout(5000);
  await ed.locator(".view-lines").click({position:{x:600,y:300}});
  await page.keyboard.press("Escape"); await page.keyboard.type("gg0w");
  for (const [name,k] of [["d","d"],["y","y"],["c","c"],["g","g"],["z","z"],["dot-2","2"],["r","r"],["f","f"],["quote",'"'],["ctrl-v-insert",null]]) {
    if (name==="ctrl-v-insert") { await page.keyboard.press("Escape"); await page.keyboard.type("i"); await page.keyboard.press("Control+v"); }
    else await page.keyboard.type(k);
    await page.waitForTimeout(1500);
    const info = await page.evaluate(() => { const ed=document.querySelector(".part.editor .monaco-editor"); const c=[...ed.querySelectorAll(".cursors-layer .cursor")].map(c=>{const r=c.getBoundingClientRect();return [r.x,r.y,r.width,r.height]}); const pseudo=[...ed.querySelectorAll('.view-line span[class*="ced-"]')].map(s=>{const b=getComputedStyle(s,"::before");return {t:s.textContent,cls:s.className,bg:b.backgroundColor,h:b.height,w:b.width,pos:b.position,bot:b.bottom}}); return {c,pseudo,status:document.querySelector(".statusbar").textContent.match(/-- [A-Z ()-]+ --|-- [A-Z ]+ --/g)}; });
    console.log(name, JSON.stringify(info));
    await page.screenshot({path:`results/vscodevim-pending-${name}.png`, clip:{x:420,y:80,width:300,height:60}});
    await page.keyboard.press("Escape"); await page.waitForTimeout(200);
    if (name==="ctrl-v-insert") await page.keyboard.press("Escape");
  }
} finally { await stop(); }
