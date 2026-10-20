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
  assert.equal(estimate("---\nfield: value\n---\n"), 130.5);
  const rows = Array.from(
    { length: 28 },
    (_, index) => `field${index}: value ${index}`,
  ).join("\n");
  assert.equal(estimate(`---\n${rows}\n---\n`), 873);
});

test("a collapsed sheet reserves the heading, not the rows", () => {
  const rows = Array.from(
    { length: 28 },
    (_, index) => `f${index}: ${index}`,
  ).join("\n");
  assert.equal(estimate(`---\n${rows}\n---\n`, { collapsed: true }), 69);
});

test("a multiline text value uses longtext estimate (not one row per source line)", () => {
  // Folded/block scalars are Text, not Unknown/YAML drafts.
  assert.equal(estimate("---\nnote: |\n  one\n  two\n  three\n---\n"), 121);
});

test("only the disclosed source rows count (no YAML draft under Sources)", () => {
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
  // 8 articles × 65, 7 gaps × 8, disclosure 32, row padding — no YAML under Sources.
  assert.equal(height, 701);
});

test("an unreadable frontmatter reserves the source it shows", () => {
  const height = estimate("---\na: 1\na: 2\n---\n");
  assert.ok(height > 121, String(height));
});

test("a WorkVault-scale Sources list still reserves far more than one line", () => {
  const entries = Array.from({ length: 108 }, (_, index) => ({
    title: `Source ${index}`,
    resource: `https://example.com/${index}`,
    id: `id-${index}`,
  }));
  const source = `---\nsources:\n${entries
    .map(
      (entry) =>
        `  - title: ${entry.title}\n    resource: ${entry.resource}\n    id: ${entry.id}`,
    )
    .join("\n")}\ndecision_confirmation: yes\n---\n`;
  const height = estimate(source, {
    renderValue: (key, value, _values) => {
      if (key !== "sources") {
        return undefined;
      }
      const rows = (value as { title: string; resource: string }[])
        .map((entry, index) => {
          const hidden = index >= 8 ? " hidden" : "";
          return `<article class="source-row"${hidden} data-source-index="${index}"><p class="source-title">${entry.title}</p><p class="source-resource">${entry.resource}</p></article>`;
        })
        .join("");
      return `<div class="source-rows">${rows}<button type="button" data-source-more>Showing 8 of 108</button></div>`;
    },
  });
  // Default WidgetType estimatedHeight (-1) is one line (~24px). A 108-source
  // sheet still only discloses 8 rows, but that is hundreds of pixels — enough
  // that a one-line reserve blanks the body when the height map is consulted.
  assert.ok(height > 600, String(height));
  assert.ok(height < 2000, String(height));
});

test("an expanded Sources list reserves every article, not only the first eight", () => {
  const entries = Array.from({ length: 12 }, (_, index) => ({
    title: `Source ${index}`,
    resource: `https://example.com/${index}`,
  }));
  const source = `---\nsources:\n${entries
    .map(
      (entry) => `  - title: ${entry.title}\n    resource: ${entry.resource}`,
    )
    .join("\n")}\n---\n`;
  const disclosed = estimate(source, {
    renderValue: (_key, value) => {
      const rows = (value as { title: string; resource: string }[])
        .map((entry, index) => {
          const hidden = index >= 8 ? " hidden" : "";
          return `<article class="source-row"${hidden} data-source-index="${index}"><p class="source-title">${entry.title}</p><p class="source-resource">${entry.resource}</p></article>`;
        })
        .join("");
      return `<div class="source-rows">${rows}<button type="button" data-source-more>Showing 8 of 12</button></div>`;
    },
  });
  const expanded = estimate(source, {
    renderValue: (_key, value) => {
      const rows = (value as { title: string; resource: string }[])
        .map(
          (entry, index) =>
            `<article class="source-row" data-source-index="${index}"><p class="source-title">${entry.title}</p><p class="source-resource">${entry.resource}</p></article>`,
        )
        .join("");
      return `<div class="source-rows">${rows}</div>`;
    },
  });
  assert.ok(expanded > disclosed, `${expanded} vs ${disclosed}`);
  // Four extra articles at 65px plus gaps — enough that falling back to the
  // disclosed estimate after expand would jump the body by >200px.
  assert.ok(expanded - disclosed > 200, String(expanded - disclosed));
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
