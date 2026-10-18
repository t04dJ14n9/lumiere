/**
 * Lumière PDF: opens PDFs in an EmbedPDF-based viewer, shows their
 * outline in the Explorer, and copies selections in a form agents can locate.
 *
 * Every capability is a plugin under plugins/ (listed in plugins/catalog.ts).
 * Each starts once the services it injects exist; the owner of the plugin
 * tree stops them on deactivation, last started first.
 */
import type { RootContext } from "@workshop/core";
import { plugins } from "./plugins/catalog";
import "./plugins/services";

export type {
  NoteSelection,
  NoteSelections,
} from "./plugins/agentBridge/note-selections";

/** Start Lumière PDF's plugins in the extension's plugin tree. */
export function startPdf(root: RootContext): void {
  for (const plugin of plugins) {
    root.plugin(plugin);
  }
}
