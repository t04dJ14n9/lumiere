import { createRenderer } from "../../../../src/markdown/html";
import {
  fileName,
  sideLabel,
} from "../../../../src/plugins/gitDiffEditor/host";
import {
  blockDefinitions,
  citations,
  containerParagraphs,
  definitions,
  paragraphDefinitions,
} from "../../../../src/webview/diff/definitions";
import { diffRows } from "../../../../src/webview/diff/rows";
import type { Target } from "../target";

const block = (text: string) => ({
  kind: "text" as const,
  text,
  from: 0,
  to: 1,
});
const renderer = createRenderer();

export const targets: Record<string, Target> = {
  definitions: { arity: 1, run: (a) => definitions(block(a)) },
  blockDefinitions: { arity: 1, run: (a) => blockDefinitions(block(a)) },
  paragraphDefinitions: { arity: 1, run: paragraphDefinitions },
  containerParagraphs: { arity: 1, run: containerParagraphs },
  citations: { arity: 1, run: citations },
  sideLabel: { arity: 1, run: (a) => sideLabel(`git:/n.md?${a}`) },
  fileName: { arity: 1, run: (a) => fileName(`file:///${a}?${a}`) },
  // Our row building, with the renderer replaced by identity...
  diffRows: { arity: 2, run: (a, b) => diffRows(a, b, (m) => m) },
  // ...and with the production renderer (markdown-it and our plugins).
  // Full markdown-it render × ~210 adversarial cases; 20s is tight under CI
  // load (flaky SIGTERM on whichever case is mid-flight). Keep CASE_MS.
  diffRowsRendered: {
    arity: 2,
    deadlineMs: 45_000,
    run: (a, b) => diffRows(a, b, (m) => renderer.renderMarkdown(m)),
  },
};
