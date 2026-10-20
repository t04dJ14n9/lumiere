import test from "node:test";
import assert from "node:assert/strict";
import { EditorState } from "@codemirror/state";
import { lineEndTarget, lineStartTarget } from "./line-start";

/** Where Home goes from `|`, with the visual line starting at the line start. */
function home(text: string): string {
  const head = text.indexOf("|");
  const state = EditorState.create({ doc: text.replace("|", "") });
  const target =
    lineStartTarget(state, head, state.doc.lineAt(head).from) ?? "default";
  return target === "default"
    ? "default"
    : state.sliceDoc(0, target) + "|" + state.sliceDoc(target);
}

test("Home goes to the start of an item's text first, as in Obsidian", () => {
  assert.equal(home("- abc|"), "- |abc");
  assert.equal(home("- a|bc"), "- |abc");
  assert.equal(home("1. abc|"), "1. |abc");
  assert.equal(home("- [ ] abc|"), "- [ ] |abc");
  assert.equal(home("> abc|"), "> |abc");
  assert.equal(home("> - abc|"), "> - |abc");
  assert.equal(home("\t- abc|"), "\t- |abc");
});

test("from the text start, on plain lines and headings, Home does its default", () => {
  assert.equal(home("- |abc"), "default");
  assert.equal(home("abc|"), "default");
  assert.equal(home("## abc|"), "default");
});

test("a wrapped line's later visual lines keep the default", () => {
  const state = EditorState.create({ doc: "- a long item" });
  assert.equal(lineStartTarget(state, 12, 8), undefined);
});

test("hidden markup still counts as the first visual line", () => {
  // Live Preview hides a task's "- ", so its visual line starts at 2.
  const state = EditorState.create({ doc: "- [ ] abc" });
  assert.equal(lineStartTarget(state, 9, 2), 6);
});

test("Home stops at text start past LP-hidden leading openers", () => {
  // CM's visual start skips hidden `**` / `[[` / `[` / `<kbd>` after the
  // list markup; Obsidian still Homes to the item's text start first.
  const homePast = (doc: string, visualStart: number) => {
    const state = EditorState.create({ doc });
    return lineStartTarget(state, doc.length, visualStart);
  };
  assert.equal(homePast("- **bold**", "- **".length), 2);
  assert.equal(homePast("- [[Note]]", "- [[".length), 2);
  assert.equal(homePast("- [t](u)", "- [".length), 2);
  assert.equal(homePast("- <kbd>x</kbd>", "- <kbd>".length), 2);
  assert.equal(homePast("- [ ] **hi**", "- [ ] **".length), 6);
  assert.equal(homePast("> **q**", "> **".length), 2);
  // Soft wrap with real text between text start and visual start: default.
  assert.equal(homePast("- a long item", 8), undefined);
});

// Measured in Obsidian 1.14.4: End goes past the markers that end the line,
// which Live Preview hides (the editor's own move stops before them).
test("End goes to the line's true end, past the markers that end it", () => {
  const end = (text: string, visualEnd: number) =>
    lineEndTarget(EditorState.create({ doc: text }), visualEnd);
  assert.equal(end("a **bold**", 8), 10);
  assert.equal(end("a **bold** *it*", 14), 15);
  assert.equal(end("x ==hi==", 6), 8);
  assert.equal(end("a `code`", 7), 8);
  // Wikilink / MD link / autolink closers are also hidden in LP.
  assert.equal(end("a [[Home]]", "a [[Home".length), 10);
  assert.equal(end("see [t](u)", "see [t".length), 10);
  assert.equal(end("see [t](<a b>)", "see [t".length), 14);
  assert.equal(end("see [t][lab]", "see [t".length), 12);
  assert.equal(end("**[[x]]**", "**[[x".length), 9);
  assert.equal(end("<https://x.io>", "<https://x.io".length), 14);
  assert.equal(end("a **b** c", 9), undefined);
  assert.equal(end("a [[x]] y", "a [[x".length), undefined);
  assert.equal(end("plain text", 10), undefined);
  assert.equal(end("a **b** c\nnext", 9), undefined);
});

test("End goes past LP-hidden styled inline HTML closers", () => {
  const end = (text: string, visualEnd: number) =>
    lineEndTarget(EditorState.create({ doc: text }), visualEnd);
  // decorateInlineHtml hides </kbd> / </u> / </mark>.
  assert.equal(end("a <kbd>Ctrl</kbd>", 11), 17);
  assert.equal(end("x <u>hi</u>", 7), 11);
  assert.equal(end("a <kbd>Ctrl</kbd>**", 11), 19);
  assert.equal(end("a <kbd>Ctrl</kbd> more", 11), undefined);
  assert.equal(end("end <mark>x</mark>", 11), 18);
});

test("End unifies link and HTML closers in one trailing run", () => {
  const end = (text: string, visualEnd: number) =>
    lineEndTarget(EditorState.create({ doc: text }), visualEnd);
  // Cross-surface combinations (link + HTML closers in one run).
  assert.equal(end("a [[x]]</kbd>", "a [[x".length), 13);
  assert.equal(end("t <kbd>x</kbd>]]", "t <kbd>x".length), 16);
  assert.equal(end("see [t](u)**", "see [t".length), 12);
  assert.equal(end("<https://x.io></u>", "<https://x.io".length), 18);
});
