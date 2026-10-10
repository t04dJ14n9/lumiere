import { connect, observe, offsetToPos } from "./lib.mjs";
import fs from "node:fs";
const { browser, page } = await connect();
// each case: one line with several elements; elements are source substrings
const cases = JSON.parse(fs.readFileSync(process.argv[2]));
const results = {};
for (const c of cases) {
  // the line under test is line 0; line 1 is a spacer
  const text = c.line + "\n\nplain";
  const probes = [];
  for (let i = 0; i <= c.line.length; i++) probes.push(offsetToPos(text, i));
  probes.push({ line: 2, ch: 0 });
  const obs0 = await observe(page, "probe-inline.md", text, probes);
  const idleObs = obs0.pop();
  const obs = obs0;
  const els = c.elements.map((e) => {
    const s = c.line.indexOf(e);
    return { e, s, t: s + e.length };
  });
  const rows = els.map((el) => {
    const rev = obs
      .map((o, i) => (o.lines[0]?.includes(el.e) ? i : -1))
      .filter((i) => i >= 0);
    return {
      e: el.e,
      span: [el.s, el.t],
      revealedAt: rev.length ? [Math.min(...rev), Math.max(...rev)] : null,
      contiguous: rev.length
        ? rev.length === Math.max(...rev) - Math.min(...rev) + 1
        : null,
      nrev: rev.length,
    };
  });
  results[c.name] = {
    line: c.line,
    rows,
    idle: idleObs.lines[0],
    allvisible: obs.map((o) => o.lines[0]),
  };
}
fs.writeFileSync(process.argv[3], JSON.stringify(results, null, 1));
for (const [k, v] of Object.entries(results)) {
  console.log("##", k, JSON.stringify(v.line), "idle:", JSON.stringify(v.idle));
  for (const r of v.rows)
    console.log(
      "  ",
      JSON.stringify(r.e),
      "span",
      r.span,
      "revealed",
      r.revealedAt,
      r.contiguous === false ? "NONCONTIG" : "",
    );
}
await browser.close();
