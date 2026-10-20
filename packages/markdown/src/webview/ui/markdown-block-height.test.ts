import assert from "node:assert/strict";
import test from "node:test";
import {
  clearHtmlBlockHeights,
  clearMarkdownBlockHeights,
  markdownBlockEstimatedHeight,
  rememberHtmlBlockHeight,
  rememberMarkdownBlockHeight,
} from "./markdown-block-height";

test("empty source still reserves one line of chrome", () => {
  assert.ok(markdownBlockEstimatedHeight("") > 20);
});

test("line count scales the reserve for tall callouts", () => {
  const small = markdownBlockEstimatedHeight("> [!note]\n> one\n");
  const lines = Array.from(
    { length: 40 },
    (_, i) => `> Callout body line ${i}`,
  );
  const large = markdownBlockEstimatedHeight(
    `> [!note] Tall\n${lines.join("\n")}`,
  );
  assert.ok(small > 40);
  assert.ok(large > small * 5);
  assert.ok(large > 800, `got ${large}`);
});

test("callouts reserve title/padding chrome beyond bare line×24", () => {
  const lines = Array.from(
    { length: 40 },
    (_, i) => `> Callout body line ${i} with enough text.`,
  );
  const source = `> [!note] Tall callout\n${lines.join("\n")}`;
  const height = markdownBlockEstimatedHeight(source);
  const bareLines = 12 + (1 + 40) * 24; // old CHROME + lines × LINE
  assert.ok(height > bareLines, `got ${height} bare=${bareLines}`);
  // Must clear 0.7 × ~1530 measured in the remount browser probe.
  assert.ok(height > 1100, `got ${height}`);
});

test("short Mermaid fences reserve tall SVG height, not bare line count", () => {
  const source = [
    "```mermaid",
    "flowchart TB",
    "  A[Start] --> B[Step]",
    "  B --> C[End]",
    "```",
  ].join("\n");
  const plain = markdownBlockEstimatedHeight(
    "> [!note]\n> one\n> two\n> three\n",
  );
  const mermaid = markdownBlockEstimatedHeight(source);
  assert.ok(mermaid >= 320, `got ${mermaid}`);
  assert.ok(
    mermaid > plain,
    `mermaid=${mermaid} should exceed same-ish line callout=${plain}`,
  );
});

test("short display math reserves MathJax height beyond bare line count", () => {
  // One source line can typeset a tall matrix / stacked fraction.
  const source =
    "$$\\begin{pmatrix}a\\\\b\\\\c\\\\d\\\\e\\\\f\\\\g\\\\h\\end{pmatrix}$$";
  const height = markdownBlockEstimatedHeight(source);
  const plainCallout = markdownBlockEstimatedHeight("> [!note]\n> x\n");
  assert.ok(height >= 300, `got ${height}`); // 8 TeX rows × 48 + chrome
  assert.ok(
    height > plainCallout,
    `math=${height} should exceed short callout=${plainCallout}`,
  );
});

test("HTML blocks with media height attrs reserve painted height, not line count", () => {
  const img = markdownBlockEstimatedHeight(
    '<img src="x.png" height="800" width="400">',
  );
  const iframe = markdownBlockEstimatedHeight(
    '<iframe src="https://example.com" height="500" width="800"></iframe>',
  );
  const bare = markdownBlockEstimatedHeight('<img src="x.png" alt="no size">');
  const plain = markdownBlockEstimatedHeight("<div>hello</div>");
  assert.ok(img >= 800, `img got ${img}`);
  assert.ok(iframe >= 500, `iframe got ${iframe}`);
  assert.ok(bare >= 200, `bare img got ${bare}`);
  assert.ok(plain < 80, `plain div got ${plain}`);
  assert.ok(img > plain * 10, `img=${img} plain=${plain}`);
});

test("short-tall flowchart fixture clears remount 0.7× measured guard", () => {
  // Browser mermaid-remount-height: measured ~638, needs afterRebuild ≥ ~447.
  const source = [
    "```mermaid",
    "flowchart TB",
    "  A[Start] --> B[Step one with a long label]",
    "  B --> C[Step two with a long label]",
    "  C --> D[Step three]",
    "  D --> E[Step four]",
    "  E --> F[Step five]",
    "  F --> G[End]",
    "```",
  ].join("\n");
  const height = markdownBlockEstimatedHeight(source);
  assert.ok(height >= 447, `got ${height}`);
});

test("HTML CSS height vh/em/% reserves beyond bare line count", () => {
  clearHtmlBlockHeights();
  const vh = markdownBlockEstimatedHeight(
    '<div style="height: 80vh; background: #444">tall</div>',
  );
  const em = markdownBlockEstimatedHeight(
    '<div style="height: 40em">tall em</div>',
  );
  const pct = markdownBlockEstimatedHeight(
    '<section style="height: 50%">half</section>',
  );
  const plain = markdownBlockEstimatedHeight("<div>hello</div>");
  // 80% of VIEWPORT_FALLBACK 640 = 512 + chrome
  assert.ok(vh >= 500, `vh got ${vh}`);
  assert.ok(em >= 600, `em got ${em}`); // 40 × 16
  assert.ok(pct >= 300, `pct got ${pct}`);
  assert.ok(plain < 80, `plain got ${plain}`);
  assert.ok(vh > plain * 10, `vh=${vh} plain=${plain}`);
});

test("remembered HTML-block height beats the CSS-unit floor on remount", () => {
  clearHtmlBlockHeights();
  const source = '<div style="height: 80vh">tall</div>';
  const floor = markdownBlockEstimatedHeight(source);
  rememberHtmlBlockHeight(source, 900);
  const cached = markdownBlockEstimatedHeight(source);
  assert.ok(cached >= 900, `got ${cached}`);
  assert.ok(cached > floor, `${cached} vs floor ${floor}`);
  // Non-HTML ignores the cache API (callout chrome from #128 is ~112, not 900).
  const callout = "> [!note]\n> x\n";
  const calloutFloor = markdownBlockEstimatedHeight(callout);
  rememberHtmlBlockHeight(callout, 900);
  assert.equal(markdownBlockEstimatedHeight(callout), calloutFloor);
  assert.ok(calloutFloor < 200, `callout floor ${calloutFloor}`);
  clearHtmlBlockHeights();
  assert.equal(markdownBlockEstimatedHeight(source), floor);
});

test("HTML attribute height percent is not treated as CSS pixels", () => {
  clearMarkdownBlockHeights();
  const pct = markdownBlockEstimatedHeight(
    '<iframe src="https://example.com" height="100%" width="800"></iframe>',
  );
  const px = markdownBlockEstimatedHeight(
    '<iframe src="https://example.com" height="100" width="800"></iframe>',
  );
  // 100% of VIEWPORT_FALLBACK 640, not 100px
  assert.ok(pct >= 600, `pct attr got ${pct}`);
  assert.ok(px >= 100 && px < 200, `px attr got ${px}`);
  assert.ok(pct > px * 2, `pct=${pct} px=${px}`);
});

test("remembered MarkdownBlock height beats the formula on remount", () => {
  clearMarkdownBlockHeights();
  const source = "> [!note] Wrap\n> " + "word ".repeat(80);
  const floor = markdownBlockEstimatedHeight(source);
  rememberMarkdownBlockHeight(source, floor + 400);
  const cached = markdownBlockEstimatedHeight(source);
  assert.ok(cached >= floor + 400, `got ${cached}`);
  clearMarkdownBlockHeights();
  assert.equal(markdownBlockEstimatedHeight(source), floor);
});
