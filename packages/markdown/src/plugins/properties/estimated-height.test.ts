import test from "node:test";
import assert from "node:assert/strict";
import { propertiesEstimatedHeight } from "./estimated-height";

const estimate = (
  source: string,
  options: {
    hidden?: boolean;
    collapsed?: boolean;
    allowEmpty?: boolean;
    listPreviewCount?: number;
    expandedLists?: ReadonlySet<string>;
    renderValue?: (
      key: string,
      value: unknown,
      values: Record<string, unknown>,
    ) => string | undefined;
  } = {},
) =>
  propertiesEstimatedHeight({
    source,
    hidden: options.hidden ?? false,
    collapsed: options.collapsed ?? false,
    allowEmpty: options.allowEmpty ?? false,
    ...(options.listPreviewCount !== undefined
      ? { listPreviewCount: options.listPreviewCount }
      : {}),
    ...(options.expandedLists ? { expandedLists: options.expandedLists } : {}),
    ...(options.renderValue ? { renderValue: options.renderValue } : {}),
  });

test("a hidden sheet reserves nothing", () => {
  assert.equal(estimate("---\na: 1\n---\n", { hidden: true }), 0);
});

test("a sheet without frontmatter reserves nothing unless an empty draft is open", () => {
  assert.equal(estimate("Just a note.\n"), 0);
  assert.equal(estimate("Just a note.\n", { allowEmpty: true }), 106);
});

test("each simple property row is one control, plus the heading and add button", () => {
  // VALUE_MIN includes +4px: pad grows past 1.75em border-box min-height.
  assert.equal(estimate("---\nfield: value\n---\n"), 134.5);
  const rows = Array.from(
    { length: 28 },
    (_, index) => `field${index}: value ${index}`,
  ).join("\n");
  assert.equal(estimate(`---\n${rows}\n---\n`), 985);
});

test("a collapsed sheet reserves the heading, not the rows", () => {
  const rows = Array.from(
    { length: 28 },
    (_, index) => `f${index}: ${index}`,
  ).join("\n");
  assert.equal(estimate(`---\n${rows}\n---\n`, { collapsed: true }), 69);
});

test("a multiline text value uses YAML-draft estimate (not one row per source line)", () => {
  // Block scalars are not editableKeys; sheet shows YAML draft (#141), not Unknown.
  assert.equal(estimate("---\nnote: |\n  one\n  two\n  three\n---\n"), 182);
});

test("a large sources list estimates as clamped text, not stacked articles", () => {
  const entries = Array.from(
    { length: 108 },
    (_, index) =>
      `  - title: Source ${index}\n    resource: https://example.com/${index}\n    id: id-${index}`,
  ).join("\n");
  const source = `---\nsources:\n${entries}\n---\n`;
  const height = estimate(source);
  const short = estimate("---\nsources: hi\n---\n");
  assert.ok(height > short, `${height} vs ${short}`);
  assert.ok(height < 200, String(height));
  const ignored = estimate(source, {
    renderValue: () =>
      '<div class="source-rows"><article class="source-row"><p class="source-title">Tall</p></article></div>',
  });
  assert.equal(ignored, height);
});

test("an unreadable frontmatter reserves the source it shows", () => {
  const height = estimate("---\na: 1\na: 2\n---\n");
  assert.ok(height > 121, String(height));
});

test("a wrapping tags list reserves more than one control row", () => {
  const tags = Array.from(
    { length: 36 },
    (_, index) => `  - project-area-${index}-long-label`,
  ).join("\n");
  // Expand past listPreviewCount so wrap estimate sees every chip.
  const height = estimate(`---\ntags:\n${tags}\n---\n`, {
    listPreviewCount: 3,
    expandedLists: new Set(["tags"]),
  });
  assert.ok(height > 200, String(height));
  assert.ok(height > estimate("---\ntags:\n  - a\n---\n") * 2, String(height));
});

test("longtext estimate caps at three unfocused lines, as in Obsidian", () => {
  // Obsidian clamps unfocused .metadata-input-longtext to 3 lines; more text
  // must not grow the remount reserve past that paint.
  const summary = Array.from({ length: 80 }, () => "wrapping").join(" ");
  const longer = Array.from({ length: 200 }, () => "wrapping").join(" ");
  const height = estimate(`---\nsummary: ${summary}\n---\n`);
  const taller = estimate(`---\nsummary: ${longer}\n---\n`);
  const short = estimate("---\nsummary: hi\n---\n");
  assert.equal(height, taller);
  assert.ok(height > short, `${height} vs short ${short}`);
  // Unclamped 80×"wrapping" used to reserve >200px; the 3-line cap stays under.
  assert.ok(height < 200, String(height));
});
