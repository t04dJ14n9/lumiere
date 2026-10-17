import test from "node:test";
import assert from "node:assert/strict";
import { EditorState } from "@codemirror/state";
import { lineStartTarget } from "./line-start";

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
