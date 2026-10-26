/**
 * The window's backend when its host is a Lumière server: the desktop app,
 * or the app in a browser (backend.ts). The window and the server share an
 * origin, so the token cookie goes along with every request.
 */
import { editorUrl, httpApi } from "./api";
import type { WindowBackend } from "./backend";
import { httpSettings } from "./settings";
import { inDesktopApp, pickFolder } from "./tauri";
import { httpUi } from "./ui-state";
import { httpViews } from "./views";

export function httpBackend(): WindowBackend {
  return {
    ...httpApi,
    ui: httpUi,
    settings: httpSettings,
    views: httpViews,
    editors: {
      // A server's page connects to its own socket.
      open: async (vault, path) => ({
        url: editorUrl(vault, path),
        dispose: () => {},
      }),
    },
    // A browser on a server has no picker that gives a path: one is typed.
    ...(inDesktopApp() ? { pickFolder } : { typesPaths: true }),
  };
}
