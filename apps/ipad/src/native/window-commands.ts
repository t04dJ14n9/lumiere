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
