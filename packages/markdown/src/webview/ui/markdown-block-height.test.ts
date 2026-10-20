import assert from "node:assert/strict";
import test from "node:test";
import { markdownBlockEstimatedHeight } from "./markdown-block-height";

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
