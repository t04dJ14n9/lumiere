// Vim motions around a rendered table in real Obsidian 1.14.4 (Live Preview, Vim on).
// node vim-probe.mjs [caseNameFilter] > vim-results-raw.md
// Needs Obsidian started with --remote-debugging-port=9444 on a vault whose
// .obsidian/app.json has {"vimMode":true,"showLineNumber":true}.
import { connect, setup, snap, press, fmt, sleep } from "./vim-lib.mjs";
import fs from "node:fs";
const { page, browser } = await connect();
const TEXT = [
  "prose above one here",
  "prose above two",
  "",
  "| alpha | beta  |",
  "| ----- | ----- |",
  "| gamma | delta |",
  "| eps   | zeta  |",
  "",
  "prose below one here",
  "prose below two",
  "",
].join("\n");
const shotDir = process.env.SHOTS ?? "vim-shots";
fs.mkdirSync(shotDir, { recursive: true });
const cases = JSON.parse(fs.readFileSync(new URL("./vim-cases.json", import.meta.url), "utf8"));
const filter = process.argv[2];
for (const c of cases) {
  if (filter && !c.name.includes(filter)) continue;
  const text = c.text ?? TEXT;
  await page.evaluate((t) => { window.__probeDoc = t; }, text);
  await setup(page, text, c.caret);
  console.log(`\n### ${c.name}\n${c.note ?? ""}\nstart: \`${c.caret.line}:${c.caret.ch}\`\n\n\`\`\``);
  console.log("start        ", fmt(await snap(page)));
  for (const [i, k] of c.keys.entries()) {
    await press(page, [k]);
    const s = await snap(page);
    console.log(`${k.padEnd(12)} ${fmt(s)}`);
    if (c.shots?.includes(i)) {
      await page.screenshot({ path: `${shotDir}/${c.name.replace(/[^a-z0-9]+/gi, "-")}-${i + 1}.png` });
    }
  }
  const last = await snap(page);
  if (last.docChanged) console.log("doc after:", JSON.stringify(last.doc));
  console.log("```");
}
await browser.close();
process.exit(0);
