import test from "node:test";
import assert from "node:assert/strict";
import { EditorState } from "@codemirror/state";
import { markdownParser } from "../../markdown/dialect";
import { codeBlockRange } from "./range";

test("an indented code block renders from the start of its lines", () => {
  const doc = "Text\n\n    indented code\n    more\n\n```\nfenced\n```";
  const state = EditorState.create({ doc });
  const ranges: Record<string, string> = {};
  markdownParser.parse(doc).iterate({
    enter(node) {
      if (node.name === "CodeBlock" || node.name === "FencedCode") {
        const { from, to } = codeBlockRange(node, state);
        ranges[node.name] = doc.slice(from, to);
      }
    },
  });
  assert.equal(ranges.CodeBlock, "    indented code\n    more");
  assert.equal(ranges.FencedCode, "```\nfenced\n```");
});
