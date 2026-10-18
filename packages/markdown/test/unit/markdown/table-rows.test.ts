import test from "node:test";
import assert from "node:assert/strict";
import { markdownParser } from "./index";
import { continuesTable } from "./table-rows";

/** The table's rows and what follows it, as parsed. */
function blocks(doc: string): string[] {
  const out: string[] = [];
  markdownParser.parse(doc).iterate({
    enter(node) {
      if (["TableRow", "Paragraph"].includes(node.name)) {
        out.push(`${node.name}: ${doc.slice(node.from, node.to)}`);
      }
    },
  });
  return out;
}

test("a table ends at a line that is not a row, as in Obsidian 1.14.4", () => {
  assert.deepEqual(blocks("| a | b |\n| - | - |\n| c | d |\nbelow\n\nend"), [
    "TableRow: | c | d |",
    "Paragraph: below",
    "Paragraph: end",
  ]);
  // Under a piped header a row starts with `|` at the margin.
  assert.deepEqual(blocks("| a | b |\n| - | - |\n| e\nc | d\n"), [
    "TableRow: | e",
    "Paragraph: c | d",
  ]);
  assert.deepEqual(blocks("| a | b |\n| - | - |\n  | c | d |\n"), [
    "Paragraph: | c | d |",
  ]);
  // Under a bare header a row has a `|` and does not start with one.
  assert.deepEqual(blocks("a | b\n--- | ---\nc | d\ne|f\ng\n"), [
    "TableRow: c | d",
    "TableRow: e|f",
    "Paragraph: g",
  ]);
});

test("the row rule follows the header's leading pipe", () => {
  assert.equal(continuesTable("| a | b |", "| c | d |"), true);
  assert.equal(continuesTable("| a | b |", "c | d"), false);
  assert.equal(continuesTable("a | b", "c | d"), true);
  assert.equal(continuesTable("a | b", "| c | d |"), false);
  assert.equal(continuesTable("a | b", "plain"), false);
});
