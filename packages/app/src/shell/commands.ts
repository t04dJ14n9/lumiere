/**
 * The window's commands, from the app menu (apps/desktop's menu.rs) or the
 * keyboard. VS Code's keys: ⌘, Settings, ⌘B the files sidebar, ⌥⌘B the
 * outline, ⌘O Open Folder. A key the editor page uses (⌘B is Bold while
 * typing) stays the editor's: the page sees it first.
 */
import { useEffect, useRef } from "react";
import type { MenuCommand } from "./tauri";

export type CommandHandlers = Readonly<Record<MenuCommand, () => void>>;

interface KeyPress {
  readonly code: string;
  readonly metaKey: boolean;
  readonly ctrlKey: boolean;
  readonly altKey: boolean;
  readonly shiftKey: boolean;
}

/** The command a key press runs in the window, if any. */
export function shortcutCommand(
  key: KeyPress,
  isMac: boolean,
): MenuCommand | undefined {
  const mod = isMac ? key.metaKey && !key.ctrlKey : key.ctrlKey && !key.metaKey;
  if (!mod || key.shiftKey) {
    return undefined;
  }
  if (key.code === "KeyB") {
    return key.altKey ? "toggle-outline" : "toggle-sidebar";
  }
  if (key.altKey) {
    return undefined;
  }
  if (key.code === "Comma") {
    return "open-settings";
  }
  return key.code === "KeyO" ? "open-vault" : undefined;
}

/** Keys pressed in the window itself (not inside an editor page) run commands. */
export function useShortcuts(handlers: CommandHandlers): void {
  const latest = useRef(handlers);
  latest.current = handlers;
  useEffect(() => {
    const isMac = /Mac|iPhone|iPad/.test(navigator.platform);
    const listener = (event: KeyboardEvent) => {
      const command = shortcutCommand(event, isMac);
      if (command) {
        // Handled here, so the app menu's same key does not run it again.
        event.preventDefault();
        latest.current[command]();
      }
    };
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, []);
}
