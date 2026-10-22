/**
 * What the shell uses of the desktop app (apps/desktop), and nothing more:
 * the native folder picker and the app menu's commands. In a browser there
 * is no Tauri and every feature has a fallback. The desktop app enables
 * `window.__TAURI__` (withGlobalTauri) and allows exactly these calls for
 * the server's origin (apps/desktop/src-tauri/capabilities).
 */

/** The app menu's commands (apps/desktop/src-tauri/src/menu.rs). */
export type MenuCommand = "open-vault";

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
