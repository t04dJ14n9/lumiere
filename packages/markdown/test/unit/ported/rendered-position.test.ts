import test from "node:test";
import assert from "node:assert/strict";
import { inlineSourceMap } from "../../../src/plugins/livePreview/rendered-position";

test("inline projections retain source offsets through nested formatting and escapes", () => {
  const source = "**Bold _inner_** and A \\| pipe";
  const mapped = inlineSourceMap(source);
  assert.equal(mapped.text, "Bold inner and A | pipe");
  assert.equal(mapped.positions[2], source.indexOf("Bold") + 2);
  assert.equal(
    mapped.positions[mapped.text.indexOf("inner") + 3],
    source.indexOf("inner") + 3,
  );
  assert.equal(
    mapped.positions[mapped.text.indexOf("|") + 1],
    source.indexOf("|") + 1,
  );
});

test("inline projections preserve entities, links and literal code source", () => {
  const source =
    "# [**label**](target) &amp; ` **literal** ` <br> tail %%hidden%%";
  const mapped = inlineSourceMap(source);
  assert.equal(mapped.text, "# label & **literal**  tail ");
  assert.equal(
    mapped.positions[mapped.text.indexOf("&") + 1],
    source.indexOf("&amp;") + 5,
  );
  assert.equal(
    mapped.positions[mapped.text.indexOf("literal") + 2],
    source.indexOf("literal") + 2,
  );
});

test("inline projection maps expanded Unicode entities and stripped-only text", () => {
  const source = "&#x1f9e0;";
  const result = inlineSourceMap(source);
  assert.equal(result.text, "🧠");
  assert.deepEqual(result.positions, [0, 0, source.length]);
  assert.deepEqual(inlineSourceMap("%%hidden%%"), { text: "", positions: [0] });
  assert.equal(inlineSourceMap("`  `").text, "  ");
});
