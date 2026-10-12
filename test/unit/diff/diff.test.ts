import test from "node:test";
import assert from "node:assert/strict";
import {
  alignBlocks,
  diffSequences,
  lineHunks,
  markSide,
  rowMarkdown,
  splitBlocks,
  wordDiff,
} from "../../../src/shared/diff";

function apply<T>(a: readonly T[], b: readonly T[]): T[] {
  const out: T[] = [];
  for (const run of diffSequences(a, b)) {
    if (run.type === "equal") {
      assert.deepEqual(
        a.slice(run.aFrom, run.aTo),
        b.slice(run.bFrom, run.bTo),
      );
      out.push(...a.slice(run.aFrom, run.aTo));
    } else if (run.type === "insert") {
      out.push(...b.slice(run.bFrom, run.bTo));
    }
  }
  return out;
}

test("myers: random sequences rebuild the new side and keep a minimal edit count", () => {
  let seed = 7;
  const random = () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
  for (let round = 0; round < 300; round++) {
    const a = Array.from(
      { length: Math.floor(random() * 30) },
      () => "abcd"[Math.floor(random() * 4)]!,
    );
    const b = Array.from(
      { length: Math.floor(random() * 30) },
      () => "abcd"[Math.floor(random() * 4)]!,
    );
    assert.deepEqual(apply(a, b), b);
    // Every run covers the sequences exactly once, in order.
    let ai = 0;
    let bi = 0;
    for (const run of diffSequences(a, b)) {
      assert.equal(run.aFrom, ai);
      assert.equal(run.bFrom, bi);
      ai = run.aTo;
      bi = run.bTo;
    }
    assert.equal(ai, a.length);
    assert.equal(bi, b.length);
  }
  const edits = diffSequences([..."abcabba"], [..."cbabac"])
    .filter((r) => r.type !== "equal")
    .reduce((n, r) => n + (r.aTo - r.aFrom) + (r.bTo - r.bFrom), 0);
  assert.equal(edits, 5);
});

test("myers: past the edit cap the middle is one replacement", () => {
  const runs = diffSequences([..."aaaa"], [..."bbbb"], undefined, 2);
  assert.deepEqual(
    runs.map((r) => r.type),
    ["delete", "insert"],
  );
});

test("lineHunks: added, modified and deleted like quick diff", () => {
  const before = "a\nb\nc\nd\ne\n";
  const after = "a\nB\nc\ne\nf\n";
  assert.deepEqual(lineHunks(before, after), [
    { kind: "modified", oldFrom: 1, oldTo: 2, newFrom: 1, newTo: 2 },
    { kind: "deleted", oldFrom: 3, oldTo: 4, newFrom: 3, newTo: 3 },
    { kind: "added", oldFrom: 5, oldTo: 5, newFrom: 4, newTo: 5 },
  ]);
  assert.deepEqual(lineHunks("x\r\ny", "x\ny"), []);
});

test("wordDiff: words change as units and a lone space joins neighbours", () => {
  assert.deepEqual(wordDiff("report it monthly.", "report it per region."), [
    { type: "equal", text: "report it " },
    { type: "delete", text: "monthly" },
    { type: "insert", text: "per region" },
    { type: "equal", text: "." },
  ]);
  assert.deepEqual(wordDiff("same", "same"), [{ type: "equal", text: "same" }]);
});

test("markSide: wraps plain runs, leaves Markdown syntax bare", () => {
  const segments = wordDiff(
    "shown as **a percentage** monthly",
    "shown as **a ratio** quarterly",
  );
  assert.equal(
    markSide(segments, "before"),
    'shown as **a <del class="mw-gd-del">percentage</del>** <del class="mw-gd-del">monthly</del>',
  );
  assert.equal(
    markSide(segments, "after"),
    'shown as **a <ins class="mw-gd-ins">ratio</ins>** <ins class="mw-gd-ins">quarterly</ins>',
  );
  const syntax = wordDiff("see [a](b)", "see [c](d)");
  assert.equal(
    markSide(syntax, "after"),
    'see [<ins class="mw-gd-ins">c</ins>](d)',
  );
  assert.equal(
    markSide(wordDiff("`a b` x", "`a c` y"), "after"),
    '`a c` <ins class="mw-gd-ins">y</ins>',
  );
});

test("splitBlocks: frontmatter, fences, math, tables and headings stay whole", () => {
  const text =
    "---\na: 1\n---\n# T\n\npara\nline\n| x |\n|---|\n| 1 |\n\n```js\n\nx\n```\n$$\ny\n$$\n";
  assert.deepEqual(
    splitBlocks(text).map((b) => [b.kind, b.from, b.to]),
    [
      ["frontmatter", 0, 3],
      ["heading", 3, 4],
      ["text", 5, 7],
      ["table", 7, 10],
      ["code", 11, 15],
      ["math", 15, 18],
    ],
  );
});

test("alignBlocks: pairs changed blocks of a kind and keeps deletions in place", () => {
  const before =
    "# T\n\nold words here\n\ngone paragraph\n\n| a |\n|---|\n| 1 |\n";
  const after = "# T\n\nnew words here\n\n| a |\n|---|\n| 2 |\n\nadded\n";
  assert.deepEqual(
    alignBlocks(before, after).map((r) => r.kind),
    ["equal", "modified", "deleted", "modified", "added"],
  );
});

test("rowMarkdown: code blocks diff by line as an HTML block on one line", () => {
  const [row] = alignBlocks("```\na\nb\n```", "```\na\nc\n```");
  const md = rowMarkdown(row!);
  assert.ok(!md.before!.includes("\n"));
  assert.match(md.before!, /mw-gd-line-del">b</);
  assert.match(md.after!, /mw-gd-line-ins">c</);
  assert.ok(!md.after!.includes("mw-gd-line-del"));
  assert.match(
    rowMarkdown({
      kind: "added",
      after: { kind: "code", text: "```\n<x>\n```", from: 0, to: 3 },
    }).after!,
    /&lt;x&gt;/,
  );
});
