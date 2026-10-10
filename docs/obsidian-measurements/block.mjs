import { connect, observe } from "./lib.mjs";
import fs from "node:fs";
const { browser, page } = await connect();
const doc =
  fs.readFileSync(process.argv[2], "utf8").replace(/\n$/, "") + "\n\n\nIDLE";
const lines = doc.split("\n");
const probes = [];
const meta = [];
const PER = (process.env.LINES || "").split(",").filter(Boolean).map(Number);
lines.forEach((l, i) => {
  const chs = PER.includes(i)
    ? [...Array(l.length + 1).keys()]
    : [0, Math.floor(l.length / 2), l.length];
  if (PER.length && !PER.includes(i) && !process.env.ALL) return;
  for (const ch of new Set(chs)) {
    probes.push({ line: i, ch });
    meta.push([i, ch]);
  }
});
const obs = await observe(page, "probe-block.md", doc, probes, {
  wait: +(process.env.WAIT || 500),
});
const idle = obs[obs.length - 1];
// map visible lines is DOM-line-based (widgets can merge), so print full text diff by DOM lines
console.log("IDLE DOM lines:", JSON.stringify(idle.lines));
let prev = null;
obs.forEach((o, k) => {
  const [i, ch] = meta[k];
  const diff = o.lines
    .map((v, j) => (v !== idle.lines[j] ? `${j}:${JSON.stringify(v)}` : null))
    .filter(Boolean);
  const key = JSON.stringify(o.lines);
  console.log(
    `L${i}:${ch} src=${JSON.stringify(lines[i])} nDOM=${o.lines.length} ${key === prev ? "(same as prev)" : diff.join(" | ")}`,
  );
  prev = key;
});
await browser.close();
