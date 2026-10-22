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
  const inlineBodies: string[] = [];
  const hidden: string[] = [];
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
      if (value.spec.class === "mw-footnote-inline-body") {
        inlineBodies.push(state.sliceDoc(from, to));
      }
      // Empty replace (hide): no widget and no mark/line class.
      if (
        value.spec.widget === undefined &&
        value.spec.class === undefined &&
        from < to
      ) {
        hidden.push(state.sliceDoc(from, to));
      }
      if (String(value.spec.class).startsWith("mw-footnote-def")) {
        lines.push({
          line: state.doc.lineAt(from).number,
          cls: value.spec.class,
        });
      }
    },
  );
  return {
    references,
    numbers,
    faint,
    markers,
    inlineBodies,
    hidden,
    lines,
    replaced,
  };
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

test("an inline footnote keeps its body visible after the LaTeX number (BH-012)", () => {
  const { references, inlineBodies, hidden, faint } = decorate(
    caret(source.length),
  );
  assert.deepEqual(references, ["1", "2", "3", "1"]);
  assert.deepEqual(inlineBodies, ["Inline text."]);
  assert.deepEqual(hidden, ["]"]);
  assert.deepEqual(faint, []);
});

test("a selection over the whole note keeps references rendered and reveals definitions", () => {
  const { references, numbers, faint, markers } = decorate(
    range(0, source.length),
  );
  assert.deepEqual(references, ["1", "2", "3", "1"]);
  assert.deepEqual(numbers, []);
  assert.deepEqual(faint, []);
  assert.deepEqual(markers, ["[^1]:", "[^note]:"]);
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
    // Blank after [^1] is not empty — next def starts immediately.
    { line: 5, cls: "mw-footnote-def" },
    { line: 6, cls: "mw-footnote-def is-continued" },
    // Obsidian: empty line after the last def stays at footnote size.
    { line: 7, cls: "mw-footnote-def is-continued" },
  ]);
  const atNote = decorate(caret(source.indexOf("[^note]:") + 3));
  assert.deepEqual(atNote.markers, ["[^note]:"]);
  assert.deepEqual(atNote.numbers, ["1"]);
  // The whole first line reveals its marker; continuation lines do not.
  const atText = decorate(caret(source.indexOf("A named footnote")));
  assert.deepEqual(atText.markers, ["[^note]:"]);
  assert.deepEqual(atText.numbers, ["1"]);
  assert.deepEqual(decorate(caret(source.indexOf("continues"))).numbers, [
    "1",
    "2",
  ]);
});

test("definitions whose body is only a markdown or wiki link still lead with their number", () => {
  const linkSource = [
    "See[^overview] and [^w].",
    "",
    "[^overview]: [伽利略概述](https://example.com/overview)",
    "[^w]: [[Target Note]]",
  ].join("\n");
  const state = EditorState.create({
    doc: linkSource,
    // Caret away from both definition lines so markers stay rendered.
    selection: EditorSelection.single(0),
    extensions: [
      documentTree,
      inlineRenderers.of(footnoteInline({} as RenderService)),
    ],
  });
  const numbers: string[] = [];
  const replaced: string[] = [];
  inlineDecorations(state, [{ from: 0, to: linkSource.length }]).between(
    0,
    linkSource.length,
    (from, to, value) => {
      const widget = value.spec.widget;
      if (widget instanceof DefinitionNumber) {
        numbers.push(widget.text);
        replaced.push(state.sliceDoc(from, to));
      }
    },
  );
  assert.deepEqual(numbers, ["1", "2"]);
  assert.deepEqual(replaced, ["[^overview]: ", "[^w]: "]);
});

test("an empty line after a footnote definition stays at footnote size", () => {
  const lone = [
    "Body.[^a]",
    "",
    "[^a]: Note text.",
    "",
    "Next paragraph.",
  ].join("\n");
  const state = EditorState.create({
    doc: lone,
    selection: EditorSelection.single(0),
    extensions: [
      documentTree,
      inlineRenderers.of(footnoteInline({} as RenderService)),
    ],
  });
  const lines: { line: number; cls: string }[] = [];
  inlineDecorations(state, [{ from: 0, to: lone.length }]).between(
    0,
    lone.length,
    (from, _to, value) => {
      if (String(value.spec.class).startsWith("mw-footnote-def")) {
        lines.push({
          line: state.doc.lineAt(from).number,
          cls: value.spec.class,
        });
      }
    },
  );
  assert.deepEqual(lines, [
    { line: 3, cls: "mw-footnote-def" },
    { line: 4, cls: "mw-footnote-def is-continued" },
  ]);
});
