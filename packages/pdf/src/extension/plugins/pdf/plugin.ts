import * as vscode from "vscode";
import type { Plugin } from "@workshop/core";
import type {} from "@workshop/platform";
import type {} from "../services";
import { registerNativeLinks } from "./native-links";
import { registerOpenLocation } from "./commands";
import { PdfEditorProvider } from "./editor-provider";
import manifest from "./manifest";
import { PdfPanels, VIEW_TYPE } from "./panels";
import { registerViewCommands } from "./view-commands";
import { ViewPreferences } from "./view-preferences";
import { PdfSettings } from "../../settings";
import { registerViewControls } from "./view-controls";

/**
 * The viewer itself: opens `*.pdf` files, tracks the open editors, and
 * takes the page, zoom, find and Open Location commands.
 */
export const pdfPlugin: Plugin = {
  name: manifest.id,
  inject: {
    required: ["extensionContext", "digests", "os"],
    optional: ["realPaths"],
  },
  provides: ["pdfPanels", "pdfSettings"],
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
        new PdfEditorProvider(extensionUri, panels, preferences, ctx.digests),
        {
          // Keep the rendered pages when the tab is hidden; reopening a PDF is slow.
          webviewOptions: { retainContextWhenHidden: true },
          supportsMultipleEditorsPerDocument: true,
        },
      ),
      "customEditor",
    );
    ctx.own(registerOpenLocation(panels, ctx.os), "command");
    ctx.own(
      registerNativeLinks(panels, {
        digests: ctx.digests,
        realPaths: ctx.realPaths,
      }),
      "native links",
    );
    ctx.own(registerViewCommands(panels), "commands");
    ctx.own(registerViewControls(panels), "view controls");
    ctx.provide("pdfPanels", panels);
    ctx.provide("pdfSettings", new PdfSettings(ctx.extensionContext.extension));
  },
};
