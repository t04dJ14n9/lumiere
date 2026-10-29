import test from "node:test";
import assert from "node:assert/strict";
import { rewriteSvgThemeId, uniqueCloneSvgId } from "./clone-svg";

test("rewriteSvgThemeId rewrites #oldId selectors in style text to #newId", () => {
  const style = [
    "#mw-abc-1 .node rect{fill:#1f2020}",
    "#mw-abc-1 .nodeLabel{color:#ccc}",
    "#other .edge{stroke:#fff}",
  ].join("\n");
  const next = rewriteSvgThemeId(style, "mw-abc-1", "mw-abc-1-inspect-1");
  assert.match(next, /#mw-abc-1-inspect-1 \.node rect\{fill:#1f2020\}/);
  assert.match(next, /#mw-abc-1-inspect-1 \.nodeLabel\{color:#ccc\}/);
  assert.match(next, /#other \.edge\{stroke:#fff\}/);
  assert.doesNotMatch(next, /#mw-abc-1 /);
});

test("rewriteSvgThemeId leaves text alone when oldId is empty or absent", () => {
  const style = "#mw-abc-1 .node{fill:red}";
  assert.equal(rewriteSvgThemeId(style, "", "x"), style);
  assert.equal(rewriteSvgThemeId(style, "missing", "x"), style);
});

test("uniqueCloneSvgId keeps a stable prefix from the original id", () => {
  const first = uniqueCloneSvgId("mw-abc-1");
  const second = uniqueCloneSvgId("mw-abc-1");
  assert.match(first, /^mw-abc-1-inspect-/);
  assert.match(second, /^mw-abc-1-inspect-/);
  assert.notEqual(first, second);
  assert.equal(uniqueCloneSvgId(null).startsWith("mermaid-inspect-"), true);
});
