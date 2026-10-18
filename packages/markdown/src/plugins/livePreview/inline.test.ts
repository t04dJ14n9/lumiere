import test from "node:test";
import assert from "node:assert/strict";
import { EditorState } from "@codemirror/state";
import { documentTree } from "./document-tree";
import { inlineRenderers } from "./registry";
import { bareUrlTarget, inlineDecorations, linkClass } from "./inline";

test("inline decorations retain basic marks, rendered links and deduplicated heading lines", () => {
  const doc = "# Title\n\n**bold** [label](target)\n\nafter";
  const state = EditorState.create({
    doc,
    selection: { anchor: doc.length },
    extensions: [documentTree],
  });
  const decorations = inlineDecorations(state, [
    { from: 0, to: 7 },
    { from: 0, to: doc.length },
  ]);
  const classes: string[] = [];
  const links: string[] = [];
  decorations.between(0, doc.length, (_from, _to, value) => {
    if (value.spec.class) {
      classes.push(value.spec.class);
    }
    if (value.spec.attributes?.["data-href"]) {
      links.push(value.spec.attributes["data-href"]);
    }
  });
  assert.equal(
    classes.filter((value) => value === "md-heading md-h1 is-first-line")
      .length,
    1,
  );
  assert.ok(classes.includes("md-strong"));
  assert.ok(classes.includes("md-link md-link-rendered"));
  assert.deepEqual(links, ["target"]);
});

test("custom inline renderers can retain detached context functions and replace core behavior", () => {
  const doc = "**bold**";
  const state = EditorState.create({
    doc,
    extensions: [
      documentTree,
      inlineRenderers.of({
        nodes: ["StrongEmphasis"],
        decorate(node, { mark }) {
          mark(node.from, node.to, "custom");
        },
      }),
    ],
  });
  const decorations = inlineDecorations(state, [{ from: 0, to: doc.length }]);
  const classes: string[] = [];
  decorations.between(0, doc.length, (_from, _to, value) => {
    classes.push(value.spec.class);
  });
  assert.deepEqual(classes, ["custom"]);
});

test("bare URLs, www addresses and angle-bracket links are rendered links", () => {
  const doc =
    "See https://example.com, www.example.org and <https://x.test>.\n\nend";
  const state = EditorState.create({
    doc,
    selection: { anchor: doc.length },
    extensions: [documentTree],
  });
  const links: string[] = [];
  const hidden: string[] = [];
  inlineDecorations(state, [{ from: 0, to: doc.length }]).between(
    0,
    doc.length,
    (from, to, value) => {
      const href = value.spec.attributes?.["data-href"];
      if (href) {
        links.push(href);
      } else if (!value.spec.class && !value.spec.widget) {
        hidden.push(doc.slice(from, to));
      }
    },
  );
  assert.deepEqual(links, [
    "https://example.com",
    "https://www.example.org",
    "https://x.test",
  ]);
  assert.deepEqual(hidden, ["<", ">"]);
});

test("a bare URL's target keeps its scheme and maps addresses to https or mail", () => {
  assert.equal(bareUrlTarget("http://a.test/x"), "http://a.test/x");
  assert.equal(bareUrlTarget("www.a.test"), "https://www.a.test");
  assert.equal(bareUrlTarget("me@a.test"), "mailto:me@a.test");
});

test("a setext heading keeps its underline visible and faint off the caret", () => {
  const doc = "Setext heading\n--------------\n\nafter";
  const state = EditorState.create({
    doc,
    selection: { anchor: doc.length },
    extensions: [documentTree],
  });
  const underline = doc.indexOf("-");
  const decorations = inlineDecorations(state, [{ from: 0, to: doc.length }]);
  const found: { from: number; to: number; cls?: string }[] = [];
  decorations.between(0, doc.length, (from, to, value) => {
    found.push({ from, to, cls: value.spec.class });
  });
  assert.ok(
    found.some(
      (d) =>
        d.from === underline &&
        d.to === underline + 14 &&
        d.cls === "md-setext-mark",
    ),
  );
  assert.ok(!found.some((d) => d.from === underline && d.cls === undefined));
  assert.ok(
    found.some(
      (d) => d.cls === "md-heading md-h2 is-first-line" && d.from === 0,
    ),
  );
});

test("only a heading on line 1 is marked as the first line, so it gets no space above", () => {
  const doc = "# Title\n\n## Section\n\n> # Quoted";
  const state = EditorState.create({
    doc,
    selection: { anchor: doc.length },
    extensions: [documentTree],
  });
  const headings: { line: number; cls: string }[] = [];
  inlineDecorations(state, [{ from: 0, to: doc.length }]).between(
    0,
    doc.length,
    (from, _to, value) => {
      const cls: unknown = value.spec.class;
      if (typeof cls === "string" && cls.startsWith("md-heading")) {
        headings.push({ line: state.doc.lineAt(from).number, cls });
      }
    },
  );
  assert.deepEqual(headings, [
    { line: 1, cls: "md-heading md-h1 is-first-line" },
    { line: 3, cls: "md-heading md-h2" },
    { line: 5, cls: "md-heading md-h1" },
  ]);
});

test("each quote line records its nesting depth, so nested quotes draw a bar per level", () => {
  const doc = "> outer\n>\n> > nested\n> > > deepest\n\nafter";
  const state = EditorState.create({
    doc,
    selection: { anchor: doc.length },
    extensions: [documentTree],
  });
  const decorations = inlineDecorations(state, [{ from: 0, to: doc.length }]);
  const depths: string[] = [];
  decorations.between(0, doc.length, (_from, _to, value) => {
    if (value.spec.class === "md-quote") {
      depths.push(value.spec.attributes?.style);
    }
  });
  assert.deepEqual(depths, [
    "--quote-depth: 1",
    "--quote-depth: 1",
    "--quote-depth: 2",
    "--quote-depth: 3",
  ]);
});

test("syntax revealed at the caret is marked faint rather than shown as text", () => {
  const doc = "## Head **bold**\n\n> quote\n\nafter";
  const marked = (anchor: number) => {
    const state = EditorState.create({
      doc,
      selection: { anchor },
      extensions: [documentTree],
    });
    const found: string[] = [];
    inlineDecorations(state, [{ from: 0, to: doc.length }]).between(
      0,
      doc.length,
      (from, to, value) => {
        if (value.spec.class === "md-syntax-mark") {
          found.push(doc.slice(from, to));
        }
      },
    );
    return found;
  };
  assert.deepEqual(marked(4), ["##"]);
  assert.deepEqual(marked(doc.indexOf("bold")), ["##", "**", "**"]);
  assert.deepEqual(marked(doc.indexOf("quote")), [">"]);
  assert.deepEqual(marked(doc.length), []);
});

test("labelled links leaving the vault are marked external once rendered", () => {
  assert.equal(
    linkClass(true, "https://example.com"),
    "md-link md-link-rendered md-link-external",
  );
  assert.equal(
    linkClass(true, "mailto:a@b.test"),
    "md-link md-link-rendered md-link-external",
  );
  assert.equal(linkClass(true, "Target.md"), "md-link md-link-rendered");
  assert.equal(linkClass(false, "https://example.com"), "md-link");
});
