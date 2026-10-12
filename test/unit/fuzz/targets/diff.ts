import { Text } from "@codemirror/state";
import {
  alignBlocks,
  lineBlockHtml,
  lineHunks,
  markSide,
  rowMarkdown,
  splitBlocks,
  splitLines,
  tokens,
  wordDiff,
} from "../../../../src/shared/diff";
import { codeSpans } from "../../../../src/shared/diff/blocks";
import { protectedRanges } from "../../../../src/shared/diff/protect";
import { computeHunks } from "../../../../src/plugins/gitGutter/hunks";
import type { Target } from "../target";

const one = (run: (a: string) => unknown): Target => ({ arity: 1, run });
const two = (run: (a: string, b: string) => unknown): Target => ({
  arity: 2,
  run,
});

export const targets: Record<string, Target> = {
  splitLines: one(splitLines),
  tokens: one(tokens),
  splitBlocks: one((a) => splitBlocks(a)),
  protectedRanges: one(protectedRanges),
  codeSpans: one(codeSpans),
  wordDiff: two(wordDiff),
  lineHunks: two(lineHunks),
  markSide: two((a, b) => {
    const segments = wordDiff(a, b);
    return [markSide(segments, "before"), markSide(segments, "after")];
  }),
  rowMarkdown: two((a, b) => alignBlocks(a, b).map((row) => rowMarkdown(row))),
  lineBlockHtml: two((a, b) => [
    lineBlockHtml(a, b, "before", "code"),
    lineBlockHtml(a, b, "after", "code"),
  ]),
  computeHunks: two((a, b) => computeHunks(a, Text.of(b.split("\n")))),
};
