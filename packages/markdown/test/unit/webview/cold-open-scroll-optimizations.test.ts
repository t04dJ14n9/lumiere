import test from "node:test";
import assert from "node:assert/strict";
import { StateEffect, Text } from "@codemirror/state";
import { ExtensionRegistry } from "../../../src/plugins/editor/extensions";
import { prepareFootnotes } from "../../../src/plugins/footnotes/preprocess";
import {
  rememberTableHeight,
  tableEstimatedHeight,
} from "../../../src/plugins/tables/estimated-height";
import { sectionHeadings } from "../../../src/plugins/stickyScroll/model";
import { parseMarkdown } from "../../../src/markdown/dialect";

test("ExtensionRegistry.batch coalesces registrations and effects into a single apply call", () => {
  const calls: Array<{ count: number; effects: number }> = [];
  const effect = StateEffect.define<string>();
  const registry = new ExtensionRegistry(
    (owner) => (owner === "a" ? 1 : 2),
    (extensions, effects = []) => {
      calls.push({
        count: Array.isArray(extensions) ? extensions.length : 1,
        effects: effects.length,
      });
    },
  );

  // Outside batch, register refreshes immediately.
  const disposeStandalone = registry.register("a", []);
  assert.equal(calls.length, 1);
  disposeStandalone();
  assert.equal(calls.length, 2);

  // Inside batch, multiple registrations and queued effects coalesce into 1 apply.
  registry.batch(() => {
    registry.register("a", []);
    registry.register("b", []);
    assert.equal(registry.dispatchEffect(effect.of("refresh")), true);
    assert.equal(calls.length, 2);
  });
  assert.equal(calls.length, 3);
  assert.deepEqual(calls[2], { count: 2, effects: 1 });
});

test("prepareFootnotes fast-rejects sources without footnote syntax without reading document", () => {
  const trapDoc = new Proxy(Text.of(["# Heading"]), {
    get() {
      throw new Error(
        "document should not be accessed when source has no footnotes",
      );
    },
  });
  const result = prepareFootnotes(
    "plain cell text without footnotes",
    trapDoc,
    0,
    "n",
  );
  assert.deepEqual(result, {
    replacements: [],
    displaySource: "plain cell text without footnotes",
  });
});

test("rememberTableHeight caches measured table height for tableEstimatedHeight", () => {
  const source = "| A | B |\n| - | - |\n| 1 | 2 |";
  const heuristic = tableEstimatedHeight(source);
  assert.ok(heuristic > 0);
  rememberTableHeight(source, 312.4);
  assert.equal(tableEstimatedHeight(source), 312);
});

test("sectionHeadings reuses an existing complete syntax tree", () => {
  const doc = Text.of(["# First", "", "## Second", "body"]);
  const tree = parseMarkdown(doc);
  const headings = sectionHeadings(doc, tree);
  assert.equal(headings.length, 2);
  assert.equal(headings[0]?.label, "First");
  assert.equal(headings[1]?.label, "Second");
});
