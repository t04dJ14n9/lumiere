import test from "node:test";
import assert from "node:assert/strict";
import { propertiesEstimatedHeight } from "./estimated-height";

const estimate = (
  source: string,
  options: {
    hidden?: boolean;
    collapsed?: boolean;
    allowEmpty?: boolean;
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
    ...(options.renderValue ? { renderValue: options.renderValue } : {}),
  });

test("a hidden sheet reserves nothing", () => {
  assert.equal(estimate("---\na: 1\n---\n", { hidden: true }), 0);
});

test("a sheet without frontmatter reserves nothing unless an empty draft is open", () => {
  assert.equal(estimate("Just a note.\n"), 0);
  assert.equal(estimate("Just a note.\n", { allowEmpty: true }), 89);
});

test("each simple property row is one control, plus the heading and add button", () => {
  assert.equal(estimate("---\nfield: value\n---\n"), 121);
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
  assert.equal(estimate(`---\n${rows}\n---\n`, { collapsed: true }), 49);
});

test("a multiline value uses the fixed YAML field, not one row per source line", () => {
  assert.equal(estimate("---\nnote: |\n  one\n  two\n  three\n---\n"), 169);
});

test("only the disclosed source rows count, and the YAML field under them does too", () => {
  const entries = Array.from({ length: 9 }, (_, index) => ({
    title: `Source ${index}`,
    resource: `https://example.com/${index}`,
  }));
  const source = `---\nsources:\n${entries
    .map(
      (entry) => `  - title: ${entry.title}\n    resource: ${entry.resource}`,
    )
    .join("\n")}\n---\n`;
  const height = estimate(source, {
    renderValue: (_key, value) => {
      const rows = (value as { title: string; resource: string }[])
        .map((entry, index) => {
          const hidden = index >= 8 ? " hidden" : "";
          return `<article class="source-row"${hidden} data-source-index="${index}"><p class="source-title">${entry.title}</p><p class="source-resource">${entry.resource}</p></article>`;
        })
        .join("");
      return `<div class="source-rows">${rows}<button type="button" data-source-more>Showing 8 of 9</button></div>`;
    },
  });
  // 8 articles × 65, 7 gaps × 8, disclosure 32, yaml field 84, row padding 4, chrome 89.
  assert.equal(height, 785);
});

test("an unreadable frontmatter reserves the source it shows", () => {
  const height = estimate("---\na: 1\na: 2\n---\n");
  assert.ok(height > 121, String(height));
});
