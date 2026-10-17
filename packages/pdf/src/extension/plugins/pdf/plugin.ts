import * as vscode from "vscode";
import type { PluginDefinition, PdfServices } from "../services";
import { registerNativeLinks } from "./native-links";
import { registerOpenLocation } from "./commands";
import { PdfEditorProvider } from "./editor-provider";
import manifest from "./manifest";
import { PdfPanels, VIEW_TYPE } from "./panels";
import { registerViewCommands } from "./view-commands";
import { ViewPreferences } from "./view-preferences";
import { registerViewControls } from "./view-controls";

/**
 * The viewer itself: opens `*.pdf` files, tracks the open editors, and
 * takes the page, zoom, find and Open Location commands.
 */
export const pdfPlugin: PluginDefinition<PdfServices> = {
  manifest,
  activate(scope) {
    const { extensionUri } = scope.get("context");
    const panels = scope.acquire(new PdfPanels(), "panels");
    const preferences = scope.acquire(
      new ViewPreferences(scope.get("context").globalState, panels),
      "view preferences",
    );
    scope.acquire(
      vscode.window.registerCustomEditorProvider(
        VIEW_TYPE,
        new PdfEditorProvider(extensionUri, panels, preferences),
        {
          // Keep the rendered pages when the tab is hidden; reopening a PDF is slow.
          webviewOptions: { retainContextWhenHidden: true },
          supportsMultipleEditorsPerDocument: true,
        },
      ),
      "customEditor",
    );
    scope.acquire(registerOpenLocation(panels), "command");
    scope.acquire(registerNativeLinks(panels), "native links");
    scope.acquire(registerViewCommands(panels), "commands");
    scope.acquire(registerViewControls(panels), "view controls");
    scope.provide("panels", panels);
  },
};
