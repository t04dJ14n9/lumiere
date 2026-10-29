import type { EditorView } from "@codemirror/view";
import type { Plugin } from "@workshop/core";
import type {} from "../editor/api";
import { protocol } from "./protocol";

/** Cmd on macOS, Ctrl elsewhere, as VS Code's keybindings use them. */
const MAC = /Mac|iPhone|iPad/u.test(globalThis.navigator?.userAgent ?? "");

/**
 * In Cursor, Cmd/Ctrl+L and Cmd/Ctrl+K hand the Live Preview caret or
 * selection to Cursor Chat and Edit. Cursor's own bindings for those keys
 * outrank every extension's, and VS Code's webview shell forwards keydowns
 * from a window bubble listener — so the note must claim them in capture
 * on the document (same pattern as undo), before Vim and before the
 * forwarder, then ask the panel host to run Chat or Edit.
 */
export const cursorBridgeWebview: Plugin = {
  name: "cursorBridge",
  inject: { required: ["editor", "rpc"] },
  apply(ctx) {
    const { rpc, editor } = ctx;
    void rpc
      .call(protocol, "isCursor", {})
      .catch(() => false)
      .then((inCursor) => {
        if (!inCursor || !ctx.isLive) {
          return;
        }
        ctx.effect(() =>
          keepCursorKeysInEditor(editor.view, (mode) => {
            void rpc
              .call(protocol, "handOff", { mode })
              .catch((error: unknown) =>
                ctx.logger.warn("Cursor hand-off failed", error),
              );
          }),
        );
      });
  },
};

/**
 * Claim Cursor's Chat/Edit chords in capture phase so the webview shell
 * never forwards them to Cursor's weight-500 bindings (or a waiting chord).
 */
export function keepCursorKeysInEditor(
  view: Pick<EditorView, "dom">,
  handOff: (mode: "chat" | "edit") => void,
  isMac = MAC,
): () => void {
  const doc = view.dom.ownerDocument;
  const listener = (event: KeyboardEvent) => {
    if (
      !belongsToEditor(view.dom, event.target) ||
      isNativeTextField(event.target)
    ) {
      return;
    }
    handOffKey(event, handOff, isMac);
  };
  doc.addEventListener("keydown", listener, true);
  return () => doc.removeEventListener("keydown", listener, true);
}

/** Claim Cursor's keys before Vim and note commands, even with only a caret. */
export function handOffKey(
  event: KeyboardEvent,
  handOff: (mode: "chat" | "edit") => void,
  isMac = MAC,
): boolean {
  const mode = handOffMode(event, isMac);
  if (!mode) {
    return false;
  }
  event.preventDefault();
  event.stopPropagation();
  handOff(mode);
  return true;
}

function handOffMode(
  event: KeyboardEvent,
  isMac: boolean,
): "chat" | "edit" | undefined {
  const command = isMac
    ? event.metaKey && !event.ctrlKey
    : event.ctrlKey && !event.metaKey;
  if (!command || event.altKey || event.shiftKey) {
    return undefined;
  }
  const key = event.key.toLowerCase();
  if (key === "l") {
    return "chat";
  }
  return key === "k" ? "edit" : undefined;
}

function belongsToEditor(
  root: { contains(node: Node): boolean },
  target: EventTarget | null,
): boolean {
  if (!target || typeof target !== "object") {
    return false;
  }
  try {
    return root.contains(target as Node);
  } catch {
    return false;
  }
}

/** Tag names (not instanceof) so tests and the iframe realm agree. */
function isNativeTextField(target: EventTarget | null): boolean {
  if (!target || !("tagName" in target)) {
    return false;
  }
  const tag = String(
    (target as { tagName?: string }).tagName ?? "",
  ).toUpperCase();
  return tag === "INPUT" || tag === "TEXTAREA";
}
