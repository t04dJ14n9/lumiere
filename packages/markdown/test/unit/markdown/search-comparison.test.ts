import test from "node:test";
import assert from "node:assert/strict";
import {
  SearchComparison,
  type SearchContext,
} from "../../../src/markdown/search/compare";
import { documentKind } from "../../../src/markdown/search/evaluate";
const context: SearchContext = {
  text: () => "",
  sensitive: false,
  allowed: true,
  mode: "property",
};

test("property comparison keeps typed null, numeric operators and exact scalar matching", () => {
  const compare = new SearchComparison();
  const matches = (query: string, value: unknown) =>
    compare.matches({ kind: "text", value: query }, value, context);
  assert.equal(matches("null", null), true);
  assert.equal(matches("null", "null"), false);
  assert.equal(matches("", null), false);
  for (const query of ["<4", "<=3", ">2", ">=3", "=3", "=3e0"]) {
    assert.equal(matches(query, 3), true);
  }
  assert.equal(matches("=3", "3"), false);
  assert.equal(matches(">3", 3), false);
  assert.equal(matches("TRUE", true), true);
  assert.equal(matches("tru", true), false);
});

test("search comparison guards recursive arrays and keeps regex sensitivity caches separate", () => {
  const compare = new SearchComparison();
  const recursive: unknown[] = [];
  recursive.push(recursive, ["match"]);
  assert.equal(
    compare.matches({ kind: "text", value: "match" }, recursive, context),
    true,
  );
  assert.equal(
    compare.matches({ kind: "text", value: "absent" }, recursive, context),
    false,
  );
  assert.equal(
    compare.matches(
      { kind: "text", value: "match" },
      { value: "match" },
      context,
    ),
    false,
  );
  const expression = { kind: "regex", value: "^abc$", flags: "" } as const;
  assert.equal(compare.matches(expression, "ABC", context), true);
  assert.equal(
    compare.matches(expression, "ABC", { ...context, sensitive: true }),
    false,
  );
  assert.equal(compare.matches(expression, "ABC", context), true);
  assert.equal(
    compare.matches({ kind: "text", value: "#parent" }, "parent/child", {
      ...context,
      mode: "tag",
    }),
    true,
  );
});

test("search file kinds use case-insensitive final extensions", () => {
  for (const path of ["Note.md", "Folder/Note.MARKDOWN"]) {
    assert.equal(documentKind(path), "markdown");
  }
  assert.equal(documentKind("Board.CANVAS"), "canvas");
  assert.equal(documentKind("Note.md.backup"), "file");
  assert.equal(documentKind("Folder.md/image.png"), "file");
});
