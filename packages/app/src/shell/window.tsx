/**
 * The window (`@workshop/app/shell`): Lumière's files, tabs and outline, over
 * whichever backend its host gives it (backend.ts). The desktop app and a
 * browser on a server start it over HTTP (main.tsx); the web and iPad apps
 * over host-web.
 */
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { installBackend, type WindowBackend } from "./backend";

export type { AppCommand, OpenedEditor, WindowBackend } from "./backend";
export { parseAppCommand } from "./backend";
export { MENU_COMMANDS, type MenuCommand } from "./tauri";
export type { FileEntry, ServerEvent, VaultList } from "./api";

export function startWindow(root: HTMLElement, backend: WindowBackend): void {
  installBackend(backend);
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
