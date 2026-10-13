import {
  diffUpdate,
  diffReady,
  diffAction,
  diffImageRequest,
  diffImageReply,
  parseDiffMessage,
} from "../../shared/diff-panel-protocol";
import { resolveDiffImages } from "./images";
/**
 * The rendered diff panel (gitDiffEditor): both versions rendered with the
 * editor's Markdown renderer and sanitizer, blocks aligned in one grid so
 * the sides scroll together, changed words and lines marked.
 */
import createDOMPurify from "dompurify";
import type { RenderOptions } from "../../markdown/html";
import { createRenderer } from "../../markdown/html";
import { sanitizerOptions } from "../../plugins/render/sanitizer-options";
import { setupPanel } from "./panel";
import { diffRows } from "./rows";
import "./diff.css";

interface VsCodeApi {
  postMessage(message: unknown): void;
}
declare function acquireVsCodeApi(): VsCodeApi;

const vscode = acquireVsCodeApi();
const purifier = createDOMPurify(window);
const renderer = createRenderer();
const sanitize = (html: string) =>
  purifier.sanitize(html, sanitizerOptions(false));
const render = (markdown: string, options: RenderOptions) =>
  renderer.renderMarkdown(markdown, { ...options, sanitize });

const app = document.getElementById("app")!;
const view = setupPanel(app, (action) =>
  vscode.postMessage(diffAction.parse({ type: "action", action })),
);

let imageId = 0;
const pending = new Map<number, (url: string) => void>();
const loadImage = (side: "left" | "right", target: string) =>
  new Promise<string>((resolve) => {
    const id = imageId++;
    pending.set(id, resolve);
    vscode.postMessage(
      diffImageRequest.parse({ type: "image", id, side, target }),
    );
  });
window.addEventListener("message", (event: MessageEvent<unknown>) => {
  const reply = parseDiffMessage(diffImageReply, event.data);
  if (reply) {
    pending.get(reply.id)?.(reply.url);
    pending.delete(reply.id);
    return;
  }
  const update = parseDiffMessage(diffUpdate, event.data);
  if (!update) {
    return;
  }
  for (const resolve of pending.values()) {
    resolve("");
  }
  pending.clear();
  const { left, right } = update;
  const rows = diffRows(left.text, right.text, render);
  view.update({ left: left.label, right: right.label }, rows);
  for (const [side, selector] of [
    ["left", ".is-before"],
    ["right", ".is-after"],
  ] as const) {
    for (const container of app.querySelectorAll<HTMLElement>(
      `.mw-diff-cell${selector}`,
    )) {
      resolveDiffImages({ container, side, load: loadImage });
    }
  }
});
vscode.postMessage(diffReady.parse({ type: "ready" }));
