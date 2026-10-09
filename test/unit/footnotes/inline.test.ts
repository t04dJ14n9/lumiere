import test from "node:test";
import assert from "node:assert/strict";
import { EditorState } from "@codemirror/state";
import { documentTree } from "../../../src/plugins/livePreview/document-tree";
import { inlineDecorations } from "../../../src/plugins/livePreview/inline";
import { inlineRenderers } from "../../../src/plugins/livePreview/registry";
import { footnoteInline } from "../../../src/plugins/footnotes/inline";
import {
  FootnoteReference,
  referenceText,
} from "../../../src/plugins/footnotes/reference-widget";
import type { RenderService } from "../../../src/plugins/render/api";

const source = [
  "A sentence.[^1] A named one.[^note]",
  "Inline.^[Inline text.] Again.[^1]",
  "",
  "[^1]: The first footnote.",
  "[^note]: A named footnote that",
  "    continues on an indented line.",
  "",
  "after",
].join("\n");

function decorate(anchor: number) {
  const state = EditorState.create({
    doc: source,
    selection: { anchor },
    extensions: [
      documentTree,
      inlineRenderers.of(footnoteInline({} as RenderService)),
    ],
  });
  const references: string[] = [];
  const lines: { line: number; cls: string }[] = [];
  const markers: string[] = [];
  inlineDecorations(state, [{ from: 0, to: source.length }]).between(
    0,
    source.length,
    (from, to, value) => {
      const widget = value.spec.widget;
      if (widget instanceof FootnoteReference) {
        references.push(referenceText(widget.note));
      }
      if (String(value.spec.class).startsWith("mw-footnote-def")) {
        lines.push({
          line: state.doc.lineAt(from).number,
          cls: value.spec.class,
        });
      }
      if (value.spec.class === "mw-footnote-marker") {
        markers.push(state.sliceDoc(from, to));
      }
    },
  );
  return { references, lines, markers };
}

test("references show compact numbers in reading order, inline footnotes included", () => {
  const { references } = decorate(source.length);
  assert.deepEqual(references, ["1", "2", "3", "1"]);
});

test("a reference shows its source while the caret is in it", () => {
  const { references } = decorate(source.indexOf("[^note]") + 2);
  assert.deepEqual(references, ["1", "3", "1"]);
});

test("definitions stay editable source with a muted marker and continued lines", () => {
  const { lines, markers } = decorate(source.length);
  assert.deepEqual(markers, ["[^1]:", "[^note]:"]);
  assert.deepEqual(lines, [
    { line: 4, cls: "mw-footnote-def" },
    { line: 5, cls: "mw-footnote-def" },
    { line: 6, cls: "mw-footnote-def is-continued" },
  ]);
});
