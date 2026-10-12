/**
 * The rendered diff panel (gitDiffEditor): both versions rendered with the
 * editor's Markdown renderer and sanitizer, blocks aligned in one grid so
 * the sides scroll together, changed words and lines marked.
 */
import createDOMPurify from "dompurify";
import { createRenderer } from "../../markdown/html";
import { sanitizerOptions } from "../../plugins/render/sanitizer-options";
import { alignBlocks, rowMarkdown } from "../../shared/diff";
import type { BlockRow } from "../../shared/diff";
import { setupPanel } from "./panel";
import "./diff.css";

interface Side {
  readonly uri: string;
  readonly label: string;
  readonly text: string;
}
interface VsCodeApi {
  postMessage(message: unknown): void;
}
declare function acquireVsCodeApi(): VsCodeApi;

const vscode = acquireVsCodeApi();
const purifier = createDOMPurify(window);
const renderer = createRenderer();
const sanitize = (html: string) =>
  purifier.sanitize(html, sanitizerOptions(false));
const render = (markdown: string) =>
  renderer.renderMarkdown(markdown, { sanitize });

/** One grid row per aligned block: HTML for each side, or a spacer. */
export function rowHtml(row: BlockRow): { before?: string; after?: string } {
  const markdown = rowMarkdown(row);
  return {
    ...(markdown.before !== undefined && { before: render(markdown.before) }),
    ...(markdown.after !== undefined && { after: render(markdown.after) }),
  };
}

const app = document.getElementById("app")!;
const view = setupPanel(app, (action) =>
  vscode.postMessage({ type: "action", action }),
);

window.addEventListener(
  "message",
  (event: MessageEvent<{ type?: string; left?: Side; right?: Side }>) => {
    const { type, left, right } = event.data;
    if (type === "update" && left && right) {
      const rows = alignBlocks(left.text, right.text).map((row) => ({
        kind: row.kind,
        ...rowHtml(row),
      }));
      view.update({ left: left.label, right: right.label }, rows);
    }
  },
);
vscode.postMessage({ type: "ready" });
