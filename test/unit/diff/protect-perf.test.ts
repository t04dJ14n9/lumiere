import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { markSide, wordDiff } from "../../../src/shared/diff";

const probe = fileURLToPath(new URL("./protect-probe.ts", import.meta.url));

for (const name of [
  "word",
  "lt",
  "brackets",
  "link",
  "math",
  "spaces",
  "backticks",
  "table",
  "urlish",
  "urls",
  "many",
]) {
  test(`R3-B1: protection of an 80k-110k character line stays linear (${name})`, () => {
    const run = spawnSync(process.execPath, ["--import", "tsx", probe, name], {
      timeout: 5000,
      encoding: "utf8",
    });
    assert.equal(run.signal, null, `${name}: killed after 5 s (stalled)`);
    assert.equal(run.status, 0, run.stderr);
    const { ms, tail } = JSON.parse(run.stdout) as { ms: number; tail: string };
    assert.ok(ms < 1000, `${name}: ${ms} ms`);
    assert.match(tail, /new/);
  });
}

test("R3-B1: the linear scanner keeps protecting the same syntax", () => {
  const mark = (a: string, b: string) => markSide(wordDiff(a, b), "after");
  const ins = (w: string) => `<ins class="mw-gd-ins">${w}</ins>`;
  assert.equal(
    mark("see https://a.test/old x", "see https://a.test/new x"),
    "see https://a.test/new x",
  );
  assert.equal(mark("a <b>old</b>", "a <b>new</b>"), `a <b>${ins("new")}</b>`);
  assert.equal(
    mark("a <span title=old>", "a <span title=new>"),
    "a <span title=new>",
  );
  assert.equal(mark("[[Old note]] x", "[[New note]] x"), "[[New note]] x");
  assert.equal(mark("[t](/old) x", "[t](/new) x"), "[t](/new) x");
  assert.equal(mark("a $x+old$ b", "a $x+new$ b"), "a $x+new$ b");
  assert.equal(mark("a old b", "a new b"), `a ${ins("new")} b`);
  // Unclosed delimiters protect nothing after them.
  assert.equal(mark("a < old", "a < new"), `a < ${ins("new")}`);
  assert.equal(mark("a [[ old", "a [[ new"), `a [[ ${ins("new")}`);
  assert.equal(mark("a ]( old", "a ]( new"), `a ]( ${ins("new")}`);
  // Line prefixes and reference definitions as before.
  assert.equal(mark("- [ ] task", "- [x] task"), "- [x] task");
  assert.equal(mark("[id]: /old", "[id]: /new"), "[id]: /new");
  assert.equal(mark("## Old", "### Old"), "### Old");
});
