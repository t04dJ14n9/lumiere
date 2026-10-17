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
          keydown(event, view) {
            const mode = handOffMode(event);
            if (!mode) {
              return false;
            }
            if (view.state.selection.main.empty) {
              // Without a selection, Cmd/Ctrl+L still opens Cursor's chat:
              // claim it from the note's Toggle checkbox status, and let it
              // through to Cursor. Cmd/Ctrl+K stays Insert Link.
              return mode === "chat";
            }
            // Keep the key from VS Code: Cursor would open an empty chat.
            event.preventDefault();
            event.stopPropagation();
            void rpc
              .call(protocol, "handOff", { mode })
              .catch((error: unknown) =>
                ctx.logger.warn("Cursor hand-off failed", error),
              );
            return true;
          },
        }),
        { slot: "override" },
      ),
    );
  },
};

function handOffMode(event: KeyboardEvent): "chat" | "edit" | undefined {
  const command = MAC ? event.metaKey : event.ctrlKey;
  if (!command || event.altKey || event.shiftKey || (MAC && event.ctrlKey)) {
    return undefined;
  }
  const key = event.key.toLowerCase();
  if (key === "l") {
    return "chat";
  }
  return key === "k" ? "edit" : undefined;
}
