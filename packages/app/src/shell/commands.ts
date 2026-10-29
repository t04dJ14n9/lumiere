/**
 * The window's commands, from the app menu (apps/desktop's menu.rs) or the
 * keyboard, with VS Code's keys (KEYS below). A key the editor page uses
 * itself (⌘B is Bold while typing) stays the editor's: the page sees it
 * first, and only keys it leaves reach the window or the app menu.
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

/**
 * `mod` is ⌘ on macOS and Ctrl elsewhere; `ctrl` is the Control key on
 * every platform (⌃⇥ is Ctrl+Tab on a Mac too).
 */
interface Binding {
  readonly code: string;
  readonly mods: readonly ("mod" | "ctrl" | "alt" | "shift")[];
  readonly command: MenuCommand;
}

export const KEYS: readonly Binding[] = [
  { code: "Comma", mods: ["mod"], command: "open-settings" },
  { code: "KeyP", mods: ["mod", "shift"], command: "command-palette" },
  { code: "F1", mods: [], command: "command-palette" },
  { code: "KeyO", mods: ["mod"], command: "open-vault" },
  { code: "KeyW", mods: ["mod"], command: "close-tab" },
  { code: "KeyB", mods: ["mod"], command: "toggle-sidebar" },
  { code: "KeyB", mods: ["mod", "alt"], command: "toggle-outline" },
  { code: "Tab", mods: ["ctrl"], command: "last-tab" },
  { code: "BracketRight", mods: ["mod", "shift"], command: "next-tab" },
  { code: "BracketLeft", mods: ["mod", "shift"], command: "previous-tab" },
  { code: "ArrowRight", mods: ["mod", "alt"], command: "next-tab" },
  { code: "ArrowLeft", mods: ["mod", "alt"], command: "previous-tab" },
  { code: "PageDown", mods: ["ctrl"], command: "next-tab" },
  { code: "PageUp", mods: ["ctrl"], command: "previous-tab" },
];

/** The command a key press runs in the window, if any: its modifiers must match exactly. */
export function shortcutCommand(
  key: KeyPress,
  isMac: boolean,
): MenuCommand | undefined {
  const pressed = [
    key.metaKey && "meta",
    key.ctrlKey && "ctrl",
    key.altKey && "alt",
    key.shiftKey && "shift",
  ].filter(Boolean);
  return KEYS.find((binding) => {
    if (binding.code !== key.code) {
      return false;
    }
    const modKey = isMac ? "meta" : "ctrl";
    const needed = new Set<string>(
      binding.mods.map((mod) => (mod === "mod" ? modKey : mod)),
    );
    return (
      needed.size === pressed.length &&
      pressed.every((mod) => needed.has(String(mod)))
    );
  })?.command;
}

/**
 * Forward a keydown event that an editor iframe left unhandled to the shell
 * window so window shortcuts work while focus is inside the note editor.
 */
export function forwardFrameKeydown(
  event: KeyboardEvent,
  targetWindow: Pick<Window, "dispatchEvent"> = window,
): boolean {
  if (event.defaultPrevented) {
    return false;
  }
  const init = {
    key: event.key,
    code: event.code,
    metaKey: event.metaKey,
    ctrlKey: event.ctrlKey,
    altKey: event.altKey,
    shiftKey: event.shiftKey,
  };
  const forwarded =
    typeof KeyboardEvent === "function"
      ? new KeyboardEvent("keydown", {
          ...init,
          bubbles: true,
          cancelable: true,
        })
      : (Object.assign(
          new Event("keydown", { bubbles: true, cancelable: true }),
          init,
        ) as unknown as KeyboardEvent);
  targetWindow.dispatchEvent(forwarded);
  if (forwarded.defaultPrevented) {
    event.preventDefault();
    return true;
  }
  return false;
}

/** Listen for unhandled shortcuts in an editor iframe and forward them to `window`. */
export function forwardFrameShortcuts(
  frameWindow: Window | null | undefined,
): () => void {
  if (!frameWindow) {
    return () => {};
  }
  const listener = (event: KeyboardEvent) => {
    forwardFrameKeydown(event);
  };
  frameWindow.addEventListener("keydown", listener);
  return () => frameWindow.removeEventListener("keydown", listener);
}

/** Keys pressed in the window itself (or forwarded from an editor page) run commands. */
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
