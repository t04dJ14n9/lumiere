import { EditorView } from "@codemirror/view";
import type { Plugin } from "@workshop/core";
import type {} from "../editor/api";
import { protocol } from "./protocol";

/** Cmd on macOS, Ctrl elsewhere, as VS Code's keybindings use them. */
const MAC = /Mac|iPhone|iPad/u.test(globalThis.navigator?.userAgent ?? "");

/**
 * In Cursor, Cmd/Ctrl+L and Cmd/Ctrl+K on a selection hand it to Cursor
 * Chat and Edit. Cursor's own bindings for these keys outrank extension
 * keybindings, so the editor answers them before they leave the webview.
 */
export const cursorBridgeWebview: Plugin = {
  name: "cursorBridge",
  inject: { required: ["editor", "rpc"] },
  async apply(ctx) {
    const { rpc } = ctx;
    const inCursor = await rpc
      .call(protocol, "isCursor", {})
      .catch(() => false);
    if (!inCursor) {
      return;
    }
    ctx.effect(() =>
      ctx.editor.extend(
        EditorView.domEventHandlers({
          keydown(event) {
            return handOffKey(event, (mode) => {
              void rpc
                .call(protocol, "handOff", { mode })
                .catch((error: unknown) =>
                  ctx.logger.warn("Cursor hand-off failed", error),
                );
            });
          },
        }),
        { slot: "override" },
      ),
    );
  },
};

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
