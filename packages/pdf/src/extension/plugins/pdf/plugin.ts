import * as vscode from "vscode";
import type { Plugin } from "@workshop/core";
import type {} from "../services";
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
export const pdfPlugin: Plugin = {
  name: manifest.id,
  inject: { required: ["extensionContext"] },
  provides: ["pdfPanels"],
  apply(ctx) {
    const { extensionUri } = ctx.extensionContext;
    const panels = ctx.own(new PdfPanels(), "panels");
    const preferences = ctx.own(
      new ViewPreferences(ctx.extensionContext.globalState, panels),
      "view preferences",
    );
    ctx.own(
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
    ctx.own(registerOpenLocation(panels), "command");
    ctx.own(registerNativeLinks(panels), "native links");
    ctx.own(registerViewCommands(panels), "commands");
    ctx.own(registerViewControls(panels), "view controls");
    ctx.provide("pdfPanels", panels);
  },
};
