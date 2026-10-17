import { connect, observe } from "./lib.mjs";
import fs from "node:fs";
const { browser, page } = await connect();
const doc =
  fs.readFileSync(process.argv[2], "utf8").replace(/\n$/, "") + "\n\n\nIDLE";
const lines = doc.split("\n");
const probes = [],
  meta = [];
lines.forEach((l, i) => {
  if (l === "IDLE") return;
  const chs = process.env.MID
    ? [0, Math.floor(l.length / 2), l.length]
    : [...Array(l.length + 1).keys()];
  for (const ch of new Set(chs)) {
    probes.push({ line: i, ch });
    meta.push([i, ch]);
  }
});
probes.push({ line: lines.length - 1, ch: 0 });
meta.push([lines.length - 1, 0]);
const obs = await observe(page, "probe-dump.md", doc, probes, {
  wait: +(process.env.WAIT || 500),
});
let prev = null,
  start = null;
const flush = (k) => {};
obs.forEach((o, k) => {
  const key = JSON.stringify(o.lines.slice(0, -1));
  const [i, ch] = meta[k];
  if (key !== prev) {
    console.log(
      `@L${i}:${ch}  ` +
        o.lines
          .slice(0, -1)
          .map((l) => JSON.stringify(l))
          .join(" ⏎ "),
    );
    prev = key;
  } else
    process.stdout.write(
      `   (L${i}:${ch} same)\n`.replace(/.*/s, (s) => (process.env.V ? s : "")),
    );
});
await browser.close();
