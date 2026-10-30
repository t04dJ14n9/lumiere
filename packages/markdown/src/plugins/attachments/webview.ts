/**
 * Attachments webview: drag-and-drop files, clipboard image paste, and
 * rewriting remote / data-URI images after HTML→Markdown paste.
 */
import { EditorView, ViewPlugin } from "@codemirror/view";
import type { Context, Plugin } from "@workshop/core";
import {
  decodeDataUri,
  encodeBase64,
  extensionForMime,
  extensionFromUrl,
  insertEmbed,
  rewriteRemoteImages,
} from "../../attachments";
import type {} from "../editor/api";
import type {} from "../pasteHtml/api";
import { protocol } from "./protocol";

export const attachmentsWebview: Plugin = {
  name: "attachments",
  inject: { required: ["editor", "rpc"] },
  apply(ctx) {
    registerPasteTransform(ctx);
    registerEditorCapture(ctx);
  },
};

function registerPasteTransform(ctx: Context): void {
  // After pasteHtml: rewrite remote/data images in the Markdown text.
  ctx.on("paste/transform", async (data) => {
    if (!data.text || (!data.text.includes("![") && !data.html)) {
      return data;
    }
    const text = await rewriteRemoteImages(data.text, (src) =>
      saveSrc(ctx, src),
    );
    return text === data.text ? data : { ...data, text };
  });
}

function registerEditorCapture(ctx: Context): void {
  ctx.effect(() =>
    ctx.editor.extend(
      ViewPlugin.define((view) => {
        const events = new AbortController();
        const opts = { capture: true, signal: events.signal };
        view.dom.addEventListener(
          "dragover",
          (event) => {
            if (hasFiles(event.dataTransfer)) {
              event.preventDefault();
            }
          },
          opts,
        );
        view.dom.addEventListener(
          "drop",
          (event) => {
            void onDrop(ctx, view, event, () => !events.signal.aborted);
          },
          opts,
        );
        view.dom.addEventListener(
          "paste",
          (event) => {
            void onPasteImage(ctx, view, event, () => !events.signal.aborted);
          },
          opts,
        );
        return { destroy: () => events.abort() };
      }),
    ),
  );
}

async function onDrop(
  ctx: Context,
  outer: EditorView,
  event: DragEvent,
  isLive: () => boolean,
): Promise<void> {
  const files = [...(event.dataTransfer?.files ?? [])];
  if (files.length === 0) {
    return;
  }
  const target = dropView(event, outer);
  if (!target) {
    return;
  }
  event.preventDefault();
  const pos =
    target.posAtCoords({ x: event.clientX, y: event.clientY }) ??
    target.state.selection.main.head;
  const embeds: string[] = [];
  for (const file of files) {
    const embed = await saveFile(ctx, file);
    if (embed) {
      embeds.push(embed);
    }
  }
  if (!isLive() || embeds.length === 0) {
    return;
  }
  insertAt(target, pos, embeds.join("\n\n"));
}

async function onPasteImage(
  ctx: Context,
  outer: EditorView,
  event: ClipboardEvent,
  isLive: () => boolean,
): Promise<void> {
  const target = editorViewFromPaste(event, outer);
  if (!target || !event.clipboardData) {
    return;
  }
  // Rich HTML paste is handled by pasteHtml + paste/transform rewrite.
  const html = event.clipboardData.getData("text/html") ?? "";
  if (html.trim()) {
    return;
  }
  const file = imageFileFromClipboard(event.clipboardData);
  if (!file) {
    return;
  }
  event.preventDefault();
  const embed = await saveFile(ctx, file);
  if (!isLive() || !embed) {
    return;
  }
  insertAt(target, target.state.selection.main.head, embed);
}

function insertAt(view: EditorView, pos: number, embed: string): void {
  const edit = insertEmbed(view.state.doc.toString(), pos, embed);
  view.dispatch({
    changes: { from: edit.from, to: edit.to, insert: edit.insert },
    selection: {
      anchor: edit.from + edit.insert.length,
    },
    userEvent: "input",
    scrollIntoView: true,
  });
}

async function saveFile(
  ctx: Context,
  file: File,
): Promise<string | undefined> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const ext = extensionFromName(file.name) || extensionForMime(file.type);
  return saveBytes(ctx, bytes, ext);
}

async function saveSrc(
  ctx: Context,
  src: string,
): Promise<string | undefined> {
  if (src.startsWith("data:")) {
    const decoded = decodeDataUri(src);
    if (!decoded) {
      return undefined;
    }
    return saveBytes(ctx, decoded.bytes, decoded.ext);
  }
  try {
    const response = await fetch(src);
    if (!response.ok) {
      return undefined;
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    const mime = response.headers.get("content-type") ?? "";
    const ext =
      extensionFromUrl(src) ||
      (mime ? extensionForMime(mime.split(";")[0]!.trim()) : "png");
    return saveBytes(ctx, bytes, ext);
  } catch {
    return undefined;
  }
}

async function saveBytes(
  ctx: Context,
  bytes: Uint8Array,
  ext: string,
): Promise<string | undefined> {
  const result = await ctx.rpc.call(protocol, "save", {
    bytesBase64: encodeBase64(bytes),
    ext,
  });
  return result.ok ? result.embed : undefined;
}

function imageFileFromClipboard(data: DataTransfer): File | undefined {
  for (const item of data.items) {
    if (item.kind === "file" && item.type.startsWith("image/")) {
      const file = item.getAsFile();
      if (file) {
        return file;
      }
    }
  }
  for (const file of data.files) {
    if (file.type.startsWith("image/")) {
      return file;
    }
  }
  return undefined;
}


function editorViewFromPaste(
  event: ClipboardEvent,
  outer: EditorView,
): EditorView | undefined {
  if (
    event.defaultPrevented ||
    !(event.target instanceof HTMLElement) ||
    event.target.closest("input, textarea")
  ) {
    return undefined;
  }
  const editable = event.target.closest("[contenteditable]");
  if (editable && !editable.classList.contains("cm-content")) {
    return undefined;
  }
  const target = EditorView.findFromDOM(event.target);
  return target && outer.dom.contains(target.dom) ? target : undefined;
}

function dropView(
  event: DragEvent,
  outer: EditorView,
): EditorView | undefined {
  if (!(event.target instanceof HTMLElement)) {
    return undefined;
  }
  if (event.target.closest("input, textarea")) {
    return undefined;
  }
  const target = EditorView.findFromDOM(event.target);
  return target && outer.dom.contains(target.dom) ? target : undefined;
}

function hasFiles(data: DataTransfer | null): boolean {
  if (!data) {
    return false;
  }
  return [...data.types].includes("Files") || data.files.length > 0;
}

function extensionFromName(name: string): string {
  const base = name.split(/[/\\]/).pop() ?? "";
  const dot = base.lastIndexOf(".");
  if (dot <= 0) {
    return "";
  }
  const ext = base.slice(dot + 1).toLowerCase();
  return /^[a-z0-9]{1,8}$/.test(ext) ? ext : "";
}

