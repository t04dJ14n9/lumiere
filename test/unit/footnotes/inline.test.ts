import test from "node:test";
import assert from "node:assert/strict";
import { EditorSelection, EditorState } from "@codemirror/state";
import { documentTree } from "../../../src/plugins/livePreview/document-tree";
import { inlineDecorations } from "../../../src/plugins/livePreview/inline";
import { inlineRenderers } from "../../../src/plugins/livePreview/registry";
import {
  DefinitionNumber,
  footnoteInline,
} from "../../../src/plugins/footnotes/inline";
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

function decorate(selection: EditorSelection) {
  const state = EditorState.create({
    doc: source,
    selection,
    extensions: [
      documentTree,
      inlineRenderers.of(footnoteInline({} as RenderService)),
    ],
  });
  const references: string[] = [];
  const numbers: string[] = [];
  const faint: string[] = [];
  const markers: string[] = [];
  const lines: { line: number; cls: string }[] = [];
  const replaced: string[] = [];
  inlineDecorations(state, [{ from: 0, to: source.length }]).between(
    0,
    source.length,
    (from, to, value) => {
      const widget = value.spec.widget;
      if (widget instanceof FootnoteReference) {
        references.push(referenceText(widget.note));
      }
      if (widget instanceof DefinitionNumber) {
        numbers.push(widget.text);
        replaced.push(state.sliceDoc(from, to));
      }
      if (value.spec.class === "md-syntax-mark") {
        faint.push(state.sliceDoc(from, to));
      }
      if (value.spec.class === "mw-footnote-marker") {
        markers.push(state.sliceDoc(from, to));
      }
      if (String(value.spec.class).startsWith("mw-footnote-def")) {
        lines.push({
          line: state.doc.lineAt(from).number,
          cls: value.spec.class,
        });
      }
    },
  );
  return { references, numbers, faint, markers, lines, replaced };
}

const caret = (at: number) => EditorSelection.single(at);
const range = (from: number, to: number) => EditorSelection.single(from, to);

test("references are superscript numbers in order of first reference, as in a LaTeX paper", () => {
  const { references, faint } = decorate(caret(source.length));
  // Named labels get numbers; a repeated reference reuses its number.
  assert.deepEqual(references, ["1", "2", "3", "1"]);
  assert.deepEqual(faint, []);
});

test("a caret inside a reference shows its faint source; leaving re-renders it", () => {
  const at = source.indexOf("[^note]") + 2;
  const inside = decorate(caret(at));
  assert.deepEqual(inside.references, ["1", "3", "1"]);
  assert.deepEqual(inside.faint, ["[^note]"]);
  const away = decorate(caret(source.indexOf("Again")));
  assert.deepEqual(away.references, ["1", "2", "3", "1"]);
  assert.deepEqual(away.faint, []);
});

test("a caret inside an inline footnote fades only its brackets", () => {
  const { references, faint } = decorate(caret(source.indexOf("text.]")));
  assert.deepEqual(references, ["1", "2", "1"]);
  assert.deepEqual(faint, ["^[", "]"]);
});

test("a selection over the whole note keeps every reference and definition rendered", () => {
  const { references, numbers, faint, markers } = decorate(
    range(0, source.length),
  );
  assert.deepEqual(references, ["1", "2", "3", "1"]);
  assert.deepEqual(numbers, ["1", "2"]);
  assert.deepEqual(faint, []);
  assert.deepEqual(markers, []);
});

test("a selection ending inside a reference keeps it rendered", () => {
  const start = source.indexOf("A named");
  const { references, faint } = decorate(
    range(start, start + "A named one.[^no".length),
  );
  assert.deepEqual(references, ["1", "2", "3", "1"]);
  assert.deepEqual(faint, []);
});

test("definitions lead with their number; the caret on the marker shows its faint source", () => {
  const { numbers, replaced, markers, lines } = decorate(caret(source.length));
  assert.deepEqual(numbers, ["1", "2"]);
  assert.deepEqual(replaced, ["[^1]: ", "[^note]: "]);
  assert.deepEqual(markers, []);
  assert.deepEqual(lines, [
    { line: 4, cls: "mw-footnote-def" },
    { line: 5, cls: "mw-footnote-def" },
    { line: 6, cls: "mw-footnote-def is-continued" },
  ]);
  const atNote = decorate(caret(source.indexOf("[^note]:") + 3));
  assert.deepEqual(atNote.markers, ["[^note]:"]);
  assert.deepEqual(atNote.numbers, ["1"]);
  // The caret at the start of the definition's text leaves the number.
  const atText = decorate(caret(source.indexOf("A named footnote")));
  assert.deepEqual(atText.markers, []);
  assert.deepEqual(atText.numbers, ["1", "2"]);
});
