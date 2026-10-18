/**
 * PDF Workshop: opens PDFs in an EmbedPDF-based viewer, shows their
 * outline in the Explorer, and copies selections in a form agents can locate.
 *
 * Every capability is a plugin under plugins/ (listed in plugins/catalog.ts).
 * Each starts once the services it injects exist; the owner of the plugin
 * tree stops them on deactivation, last started first.
 */
import type { Plugin, RootContext } from "@workshop/core";
import { pdfPlugins } from "./plugins/catalog";
import "./plugins/services";

export type {
  NoteSelection,
  NoteSelections,
} from "./plugins/agentBridge/note-selections";

/**
 * Start PDF Workshop's plugins in the extension's plugin tree, with the
 * platform's own (`pdfDesktopPlugins` from `@workshop/pdf/desktop` on the
 * desktop).
 */
export function startPdf(
  root: RootContext,
  platformPlugins: readonly Plugin[] = [],
): void {
  for (const plugin of pdfPlugins(platformPlugins)) {
    root.plugin(plugin);
  }
}
