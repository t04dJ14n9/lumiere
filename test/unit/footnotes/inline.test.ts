import test from "node:test";
import assert from "node:assert/strict";
import { EditorState } from "@codemirror/state";
import { documentTree } from "../../../src/plugins/livePreview/document-tree";
import { inlineDecorations } from "../../../src/plugins/livePreview/inline";
import { inlineRenderers } from "../../../src/plugins/livePreview/registry";
import { footnoteInline } from "../../../src/plugins/footnotes/inline";
import {
  FootnoteReference,
  referenceSource,
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

function decorate(anchor: number, head = anchor) {
  const state = EditorState.create({
    doc: source,
    selection: { anchor, head },
    extensions: [
      documentTree,
      inlineRenderers.of(footnoteInline({} as RenderService)),
    ],
  });
  const references: string[] = [];
  const shown: string[] = [];
  const hidden: string[] = [];
  const labels: string[] = [];
  const lines: { line: number; cls: string }[] = [];
  const markers: string[] = [];
  const faint: string[] = [];
  const editing: string[] = [];
  const brackets: string[] = [];
  inlineDecorations(state, [{ from: 0, to: source.length }]).between(
    0,
    source.length,
    (from, to, value) => {
      const widget = value.spec.widget;
      if (widget instanceof FootnoteReference) {
        references.push(referenceText(widget.note));
        const { open, text, close } = referenceSource(widget.note);
        shown.push(`${widget.style}:${open}${text}${close}`);
      } else if (value.point && from < to) {
        hidden.push(state.sliceDoc(from, to));
      }
      if (value.spec.class === "mw-footnote-label") {
        labels.push(state.sliceDoc(from, to));
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
      if (value.spec.class === "md-syntax-mark") {
        faint.push(state.sliceDoc(from, to));
      }
      if (value.spec.class === "mw-footnote-ref is-source is-editing") {
        editing.push(state.sliceDoc(from, to));
      }
      if (value.spec.class === "mw-footnote-bracket") {
        brackets.push(state.sliceDoc(from, to));
      }
    },
  );
  return {
    references,
    shown,
    hidden,
    labels,
    lines,
    markers,
    faint,
    editing,
    brackets,
  };
}

test("references show their own source in superscript, as in Obsidian 1.14", () => {
  const { references, shown } = decorate(source.length);
  assert.deepEqual(shown, [
    "source:[^1]",
    "source:[^note]",
    "source:^[Inline text.]",
    "source:[^1]",
  ]);
  // Rendered blocks still number references in reading order.
  assert.deepEqual(references, ["1", "2", "3", "1"]);
});

test("a reference stays a superscript with faint brackets while the caret is in it", () => {
  const { references, faint, editing, brackets } = decorate(
    source.indexOf("[^note]") + 2,
  );
  assert.deepEqual(references, ["1", "3", "1"]);
  assert.deepEqual(editing, ["[^note]"]);
  assert.deepEqual(brackets, ["[^", "]"]);
  assert.deepEqual(faint, []);
});

test("a selection over the whole note keeps every reference a superscript", () => {
  const { references, faint, editing, brackets, markers } = decorate(
    0,
    source.length,
  );
  assert.deepEqual(references, []);
  assert.deepEqual(editing, ["[^1]", "[^note]", "^[Inline text.]", "[^1]"]);
  assert.deepEqual(brackets, ["[^", "]", "[^", "]", "^[", "]", "[^", "]"]);
  assert.deepEqual(faint, []);
  // Definitions show their faint [^label]: source, as in Obsidian.
  assert.deepEqual(markers, ["[^1]:", "[^note]:"]);
});

test("a selection over part of a line keeps its reference a superscript", () => {
  const start = source.indexOf("A named");
  const { editing, shown } = decorate(start, start + "A named one.[^no".length);
  assert.deepEqual(editing, ["[^note]"]);
  assert.deepEqual(shown, [
    "source:[^1]",
    "source:^[Inline text.]",
    "source:[^1]",
  ]);
});

test("definitions lead with a superscript label; the caret reveals the faint marker", () => {
  const { lines, markers, labels, hidden } = decorate(source.length);
  assert.deepEqual(markers, []);
  assert.deepEqual(labels, ["1", "note"]);
  assert.deepEqual(hidden, ["[^", "]:", "[^", "]:"]);
  const atNote = decorate(source.indexOf("[^note]:") + 3);
  assert.deepEqual(atNote.markers, ["[^note]:"]);
  assert.deepEqual(atNote.labels, ["1"]);
  assert.deepEqual(lines, [
    { line: 4, cls: "mw-footnote-def" },
    { line: 5, cls: "mw-footnote-def" },
    { line: 6, cls: "mw-footnote-def is-continued" },
  ]);
});
