import { EditorState } from "@codemirror/state";
import {
  buildInline,
  ghostMarkdown,
} from "../../../../src/plugins/gitInline/decorations";
import {
  computeHunks,
  hunkField,
} from "../../../../src/plugins/gitGutter/hunks";
import {
  outerBlock,
  peekContext,
  peekMarkdown,
} from "../../../../src/plugins/gitGutter/peek";
import type { GitDiff } from "../../../../src/plugins/gitGutter/api";
import type { RenderService } from "../../../../src/plugins/render/api";
import type { Target } from "../target";

/**
 * No Markdown language: @codemirror/lang-markdown itself takes ~10 s to
 * parse a 100 000-space line (upstream, before any plugin code runs), so
 * with it this harness would time the editor's parser, not our code. Block
 * ranges then come from our own splitter.
 */
const LANGUAGE: never[] = [];

/** The inline decorations of `now` against `base`, as the plugin builds them. */
function inline(base: string, now: string) {
  const state = EditorState.create({
    doc: now,
    extensions: [hunkField, ...LANGUAGE],
  });
  const diff = {
    field: hunkField,
    label: () => "HEAD",
    blockRange: outerBlock,
    context: peekContext,
  } as unknown as GitDiff;
  const set = { hunks: computeHunks(base, state.doc), generation: 1 };
  return buildInline(state, set, { diff, render: {} as RenderService });
}

/** The gutter peek's Markdown for every hunk, with its block context. */
function peek(base: string, now: string) {
  const state = EditorState.create({
    doc: now,
    extensions: LANGUAGE,
  });
  return computeHunks(base, state.doc).map((hunk) => {
    const { old, now: current } = peekContext(state, hunk);
    return peekMarkdown(old, current);
  });
}

export const targets: Record<string, Target> = {
  ghostMarkdown: { arity: 2, run: (a, b) => ghostMarkdown(a, b) },
  buildInline: { arity: 2, run: inline },
  peekMarkdown: { arity: 2, run: peek },
};
