/**
 * Bundle size report: raw and gzip sizes of what the webview loads (the entry,
 * every lazy chunk, the CSS), the extension host and the workers, compared with
 * scripts/bundle-baseline.json. Markdown on stdout (CI appends it to the job
 * summary); growth over the tolerance is a warning annotation, not a failure,
 * because a deliberate feature may grow the bundle. Refresh the baseline with
 * `node scripts/bundle-size.mjs --write-baseline` after a deliberate change.
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { gzipSync } from "node:zlib";

const baselineFile = "scripts/bundle-baseline.json";
const tolerance = 0.1;

function files(dir, pattern) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      return files(full, pattern);
    }
    return pattern.test(entry.name) ? [full] : [];
  });
}

const measure = (list) =>
  list.map((file) => {
    const bytes = readFileSync(file);
    return { file, raw: bytes.length, gzip: gzipSync(bytes).length };
  });
const sum = (list, key) => list.reduce((total, item) => total + item[key], 0);

const webview = measure(files("dist/markdown/webview", /\.(js|css)$/));
const entry = webview.find((item) => item.file.endsWith("webview/editor.js"));
const chunks = webview.filter(
  (item) => item.file.endsWith(".js") && item !== entry,
);
const host = measure(["dist/extension.js"]);
const workers = measure(files("dist/markdown/workers", /\.(c?js)$/));
const pdfViewer = measure(files("dist/pdf/webview", /\.(js|css|wasm)$/));
const pdfBridge = measure(
  files("dist/pdf", /^(agent-bridge-server|bridge-stdio)\.js$/),
);

const current = {
  "webview entry (editor.js)": entry.raw,
  "webview lazy chunks (count)": chunks.length,
  "webview lazy chunks (total)": sum(chunks, "raw"),
  "webview all JS": entry.raw + sum(chunks, "raw"),
  "webview CSS": sum(
    webview.filter((item) => item.file.endsWith(".css")),
    "raw",
  ),
  "extension host": sum(host, "raw"),
  workers: sum(workers, "raw"),
  "pdf viewer (JS, CSS, WASM)": sum(pdfViewer, "raw"),
  "pdf agent bridge": sum(pdfBridge, "raw"),
};

if (process.argv.includes("--write-baseline")) {
  writeFileSync(baselineFile, `${JSON.stringify(current, null, 2)}\n`);
  console.error(`Wrote ${baselineFile}`);
}

let baseline = {};
try {
  baseline = JSON.parse(readFileSync(baselineFile, "utf8"));
} catch {
  // No baseline yet: report sizes only.
}

const kb = (bytes) => `${(bytes / 1024).toFixed(0)} KB`;
const lines = [
  "### Bundle size",
  "",
  "| | now | baseline | change |",
  "| --- | ---: | ---: | ---: |",
];
const warnings = [];
for (const [name, value] of Object.entries(current)) {
  const before = baseline[name];
  const count = name.endsWith("(count)");
  const show = (n) => (count ? String(n) : kb(n));
  const change =
    before === undefined
      ? "n/a"
      : `${value >= before ? "+" : "-"}${count ? Math.abs(value - before) : kb(Math.abs(value - before))}`;
  lines.push(
    `| ${name} | ${show(value)} | ${before === undefined ? "n/a" : show(before)} | ${change} |`,
  );
  if (!count && before && value > before * (1 + tolerance)) {
    warnings.push(
      `::warning title=Bundle size::${name} grew from ${kb(before)} to ${kb(value)} (over ${tolerance * 100}%). If deliberate, refresh ${baselineFile}.`,
    );
  }
}
const largest = [...chunks, entry].sort((a, b) => b.raw - a.raw).slice(0, 5);
lines.push(
  "",
  "Largest webview scripts (raw / gzip): " +
    largest
      .map(
        (item) =>
          `\`${path.basename(item.file)}\` ${kb(item.raw)} / ${kb(item.gzip)}`,
      )
      .join(", "),
);
console.log(lines.join("\n"));
for (const warning of warnings) {
  console.log(warning);
}
