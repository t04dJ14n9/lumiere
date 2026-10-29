/**
 * The iPad's `LumiereWindowCommands` plugin (WindowCommandsPlugin.swift): the
 * commands chosen in the menu bar, with keys, or More… in the edit menu, as
 * the window's backend hands them to the window (`appCommands`).
 */
import { registerPlugin, type PluginListenerHandle } from "@capacitor/core";
import { parseAppCommand, type AppCommand } from "@workshop/app/shell";

interface WindowCommandsPlugin {
  addListener(
    event: "command",
    listener: (data: { readonly command?: unknown }) => void,
  ): Promise<PluginListenerHandle>;
}

const plugin = registerPlugin<WindowCommandsPlugin>("LumiereWindowCommands");

/** Insert Sketch in the edit menu (WindowCommandsPlugin.swift, `insertSketch`). */
export const INSERT_SKETCH = "insert-sketch";

/**
 * Run `insert` when Insert Sketch is chosen in the edit menu, if a note's
 * page has the focus: the edit menu shows for any text, and the host's
 * active note is the last one focused, which may be hidden behind Settings.
 */
export function insertSketchRequests(
  insert: () => void,
  doc: Pick<Document, "activeElement"> = document,
): () => void {
  const handle = plugin.addListener("command", ({ command }) => {
    if (command === INSERT_SKETCH && isNoteFocused(doc)) {
      insert();
    }
  });
  return () => void handle.then((listening) => listening.remove());
}

/** Whether the focus is in a note's page (the window's editor frame). */
export function isNoteFocused(doc: Pick<Document, "activeElement">): boolean {
  const focused = doc.activeElement;
  return (
    focused?.tagName === "IFRAME" &&
    focused.classList.contains("editor-frame") &&
    !focused.hasAttribute("hidden")
  );
}

export function appCommands(
  listener: (command: AppCommand) => void,
): () => void {
  const handle = plugin.addListener("command", ({ command }) => {
    const known = parseAppCommand(command);
    if (known) {
      listener(known);
    }
  });
  return () => void handle.then((listening) => listening.remove());
}
