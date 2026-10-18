/**
 * Every PDF plugin. Each starts once the services it injects exist (see
 * @workshop/core), so this order only decides event and command precedence.
 *
 *   pdf          the viewer: custom editor, open editors, page/zoom/find, Open Location
 *   pdfToolbar   where the controls are: status bar entries, the mode setting
 *   pdfOutline   the PDF Outline view in the Explorer
 *   pdfLookUp    macOS Look Up: a force click or the context menu opens the Dictionary
 *   pdfSettings  PDF: Open Settings and the commands that change the common settings
 *   pdfZen       zen mode: core Zen Mode, and a floating bar with Exit zen in the viewer
 *   ideContext   Copy/Send IDE Context (clipboard-first; never silent-guess)
 *
 * The desktop adds its own (../desktop.ts) before ideContext, which uses
 * their services when they exist.
 */
import { ideContextPlugin } from "./ideContext/plugin";
import { pdfPlugin } from "./pdf/plugin";
import { pdfLookUpPlugin } from "./pdfLookUp/plugin";
import { pdfSettingsPlugin } from "./pdfSettings/plugin";
import { pdfOutlinePlugin } from "./pdfOutline/plugin";
import { pdfToolbarPlugin } from "./pdfToolbar/plugin";
import { pdfZenPlugin } from "./pdfZen/plugin";
import { pdfHistoryPlugin } from "./pdfHistory/plugin";
import type { Plugin } from "@workshop/core";

/** The plugins every platform runs, in order, with a place for the desktop's. */
export function pdfPlugins(desktop: readonly Plugin[]): readonly Plugin[] {
  return [
    pdfPlugin,
    pdfHistoryPlugin,
    pdfToolbarPlugin,
    pdfOutlinePlugin,
    pdfLookUpPlugin,
    pdfZenPlugin,
    pdfSettingsPlugin,
    ...desktop,
    ideContextPlugin,
  ];
}
