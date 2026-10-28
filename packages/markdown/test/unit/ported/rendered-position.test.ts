import test from "node:test";
import assert from "node:assert/strict";
import {
  inlineSourceMap,
  renderedPosition,
} from "../../../src/plugins/livePreview/rendered-position";

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

test("inline projections map wikilinks and escaped pipes inside inline code", () => {
  const wiki = inlineSourceMap("See [[Target|Alias]] and [[Plain]]");
  assert.equal(wiki.text, "See Alias and Plain");
  assert.equal(
    wiki.positions[wiki.text.indexOf("Alias") + 2],
    "See [[Target|".length + 2,
  );
  assert.equal(
    wiki.positions[wiki.text.indexOf("Plain") + 3],
    "See [[Target|Alias]] and [[".length + 3,
  );

  const code = inlineSourceMap("`a \\| b`");
  assert.equal(code.text, "a | b");
  assert.equal(code.positions[code.text.indexOf("b")], "`a \\| ".length);
});

test("renderedPosition tolerates trailing block newline from markdown-it paragraph", () => {
  const textNode = { nodeType: 3, data: "Banana" } as unknown as Node;
  const element = {
    textContent: "Banana\n",
    contains: (node: Node) => node === textNode,
  } as unknown as HTMLElement;
  const prevCaret = (
    globalThis.document as unknown as
      | {
          caretRangeFromPoint?: unknown;
        }
      | undefined
  )?.caretRangeFromPoint;
  const prevCreateRange = (
    globalThis.document as unknown as
      | {
          createRange?: unknown;
        }
      | undefined
  )?.createRange;
  const docObj = ((globalThis.document as unknown) ?? {}) as Record<
    string,
    unknown
  >;
  globalThis.document = docObj as unknown as Document;
  docObj.caretRangeFromPoint = () => ({
    startContainer: textNode,
    startOffset: 3,
  });
  docObj.createRange = () => ({
    selectNodeContents() {},
    setEnd() {},
    toString: () => "Ban",
  });
  try {
    assert.equal(
      renderedPosition("Banana", element, { clientX: 50, clientY: 10 }),
      3,
    );
  } finally {
    docObj.caretRangeFromPoint = prevCaret;
    docObj.createRange = prevCreateRange;
  }
});
