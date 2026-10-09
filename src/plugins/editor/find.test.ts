import test from "node:test";
import assert from "node:assert/strict";
import { EditorState } from "@codemirror/state";
import { SearchQuery } from "@codemirror/search";
import { countLabel, countMatches, countLimit } from "./find-count";

function state(doc: string, from = 0, to = from): EditorState {
  return EditorState.create({ doc, selection: { anchor: from, head: to } });
}

test("find counts matches and the selected one, case-insensitively by default", () => {
  const query = new SearchQuery({ search: "one" });
  const doc = "One one two one";
  assert.deepEqual(countMatches(state(doc), query), {
    current: 0,
    total: 3,
    capped: false,
  });
  const selected = countMatches(state(doc, 4, 7), query);
  assert.equal(selected.current, 2);
  assert.equal(countLabel(query, selected), "2 / 3");
  assert.equal(countLabel(query, countMatches(state(doc), query)), "3 results");
  const exact = new SearchQuery({ search: "One", caseSensitive: true });
  assert.equal(countMatches(state(doc), exact).total, 1);
});

test("find reports no results and an empty query", () => {
  const missing = new SearchQuery({ search: "zebra" });
  assert.equal(
    countLabel(missing, countMatches(state("text"), missing)),
    "No results",
  );
  const empty = new SearchQuery({ search: "" });
  assert.equal(countLabel(empty, countMatches(state("text"), empty)), "");
});

test("find stops counting at the limit", () => {
  const query = new SearchQuery({ search: "a" });
  const count = countMatches(state("a".repeat(countLimit + 5)), query);
  assert.equal(count.total, countLimit);
  assert.equal(count.capped, true);
  assert.equal(countLabel(query, count), `${countLimit}+ results`);
});
