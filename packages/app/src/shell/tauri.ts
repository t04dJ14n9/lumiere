/**
 * What the shell uses of the desktop app (apps/desktop), and nothing more:
 * the native folder picker, the app menu's commands, closing the window and
 * the app's theme.
 * In a browser there is no Tauri and every feature has a fallback. The desktop app enables
 * `window.__TAURI__` (withGlobalTauri) and allows exactly these calls for
 * the server's origin (apps/desktop/src-tauri/capabilities).
 */

/** The app menu's commands (apps/desktop/src-tauri/src/menu.rs, `PAGE_COMMANDS`). */
export const MENU_COMMANDS = [
  "open-vault",
  "open-settings",
  "close-tab",
  "toggle-sidebar",
  "toggle-outline",
  "theme-system",
  "theme-light",
  "theme-dark",
] as const;

export type MenuCommand = (typeof MENU_COMMANDS)[number];

/** Tauri events the shell listens to; the desktop app emits them. */
export const MENU_EVENT = "lumiere://menu";

interface TauriGlobal {
  readonly dialog: {
    open(options: {
      directory: boolean;
      multiple: boolean;
      title: string;
    }): Promise<string | string[] | null>;
  };
  readonly window?: {
    getCurrentWindow(): { close(): Promise<void> };
  };
  readonly app?: {
    setTheme(theme: "light" | "dark" | null): Promise<void>;
  };
  readonly event: {
    listen<T>(
      name: string,
      handler: (event: { payload: T }) => void,
    ): Promise<() => void>;
  };
}

function tauri(): TauriGlobal | undefined {
  return (window as unknown as { __TAURI__?: TauriGlobal }).__TAURI__;
}

export function inDesktopApp(): boolean {
  return tauri() !== undefined;
}

/** The native folder picker; undefined when cancelled or outside the app. */
export async function pickFolder(): Promise<string | undefined> {
  const picked = await tauri()?.dialog.open({
    directory: true,
    multiple: false,
    title: "Open a folder of notes",
  });
  return typeof picked === "string" ? picked : undefined;
}

/**
 * The app's appearance (title bar, menus, dialogs): light, dark, or null for
 * the system's. Never rejects; outside the app it does nothing.
 */
export async function setAppTheme(
  theme: "light" | "dark" | null,
): Promise<void> {
  try {
    await tauri()?.app?.setTheme(theme);
  } catch {
    // An older app without the permission keeps the system's title bar.
  }
}

/** Close the window: in the desktop app that quits it, as on its last tab. Never rejects. */
export async function closeWindow(): Promise<void> {
  const current = tauri()?.window?.getCurrentWindow();
  try {
    await (current ? current.close() : Promise.resolve(window.close()));
  } catch {
    // Nothing more to do: the window stays open.
  }
}

export function onMenuCommand(
  handler: (command: MenuCommand) => void,
): () => void {
  const events = tauri()?.event;
  if (!events) {
    return () => {};
  }
  let stop: (() => void) | undefined;
  let stopped = false;
  void events
    .listen<MenuCommand>(MENU_EVENT, (event) => handler(event.payload))
    .then((unlisten) => {
      stop = unlisten;
      if (stopped) {
        unlisten();
      }
    });
  return () => {
    stopped = true;
    stop?.();
  };
}
