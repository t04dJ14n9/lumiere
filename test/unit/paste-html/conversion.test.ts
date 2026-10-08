import test from "node:test";
import assert from "node:assert/strict";
import { EditorState } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";
import { markdownLanguageSupport } from "../../../src/markdown/dialect";
import { markdownFromHtml } from "../../../src/plugins/pasteHtml/conversion";
import {
  acceptsHtml,
  pasteTransformed,
} from "../../../src/plugins/pasteHtml/paste";

test("rich HTML converts headings, literal text, formatting, lists and tables", () => {
  assert.equal(
    markdownFromHtml(
      "<h2>Heading</h2><p>A <strong>bold</strong> <em>word</em> <mark>mark</mark> <del>gone</del>.</p>",
    ),
    "## Heading\n\nA **bold** *word* ==mark== ~~gone~~.",
  );
  assert.equal(
    markdownFromHtml("<p>*literal* [brackets]</p>"),
    "\\*literal\\* \\[brackets\\]",
  );
  assert.match(
    markdownFromHtml(
      '<ul><li><input type="checkbox" checked>Done</li><li>Next<ul><li>Nested</li></ul></li></ul>',
    )!,
    /\[x\] Done/,
  );
  assert.equal(
    markdownFromHtml(
      "<table><tr><th>A</th><th>B</th></tr><tr><td><strong>x</strong></td><td>a|b</td></tr></table>",
    ),
    "| A | B |\n| --- | --- |\n| **x** | a\\|b |",
  );
});
test("HTML conversion preserves wiki aliases, embeds, math and folded callouts", () => {
  assert.equal(
    markdownFromHtml('<a class="internal-link" data-href="Note">Alias</a>'),
    "[[Note|Alias]]",
  );
  assert.equal(
    markdownFromHtml(
      '<span class="internal-embed" data-href="pic.png"><img alt="200"></span>',
    ),
    "![[pic.png|200]]",
  );
  assert.equal(
    markdownFromHtml('<span class="math" data-tex="x+y"></span>'),
    "$x+y$",
  );
  assert.equal(
    markdownFromHtml('<div class="math-display" data-tex="x+y"></div>'),
    "$$\nx+y\n$$",
  );
  assert.equal(
    markdownFromHtml(
      '<div data-callout="note" data-callout-fold="-"><div class="callout-title-inner">Note</div><div class="callout-content"><p>Body</p></div></div>',
    ),
    "> [!note]-\n> Body",
  );
});
test("conversion drops active containers and script destinations", () => {
  assert.equal(
    markdownFromHtml(
      '<script>alert(1)</script><style>body{}</style><iframe>hidden</iframe><p>Safe <a href="javascript:alert(1)">label</a></p>',
    ),
    "Safe label",
  );
  assert.equal(
    markdownFromHtml('<img src="data:text/html,bad" alt="safe">'),
    "safe",
  );
});
function view(doc = "before") {
  let state = EditorState.create({ doc, selection: { anchor: doc.length } });
  return {
    get state() {
      return state;
    },
    dispatch(spec: Parameters<EditorState["update"]>[0]) {
      state = state.update(spec).state;
    },
  } as EditorView;
}
test("async paste applies once and rejects changed documents, selections and closed views", async () => {
  const target = view();
  assert.equal(
    await pasteTransformed({
      view: target,
      data: { html: "", text: "**after**" },
      transform: async (data) => data,
      isLive: () => true,
    }),
    true,
  );
  assert.equal(target.state.doc.toString(), "before**after**");
  for (const change of ["text", "selection", "closed"]) {
    const target = view();
    let finish!: (data: { html: string; text: string }) => void;
    const pending = pasteTransformed({
      view: target,
      data: { html: "", text: "paste" },
      transform: () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
      isLive: () => change !== "closed",
    });
    if (change === "text") {
      target.dispatch({ changes: { from: 0, insert: "typed" } });
    }
    if (change === "selection") {
      target.dispatch({ selection: { anchor: 0 } });
    }
    finish({ html: "", text: "paste" });
    assert.equal(await pending, false);
    assert.ok(!target.state.doc.toString().includes("paste"));
  }
});
test("HTML conversion is suppressed inside literal code", () => {
  for (const doc of ["`literal`", "```\nliteral\n```", "    literal"]) {
    const state = EditorState.create({
      doc,
      selection: { anchor: doc.indexOf("literal") + 2 },
      extensions: markdownLanguageSupport(),
    });
    assert.equal(acceptsHtml(state), false);
  }
});
