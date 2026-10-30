import * as vscode from "vscode";
import {
  cyclePageColors,
  pageColorsLabel,
  parsePageColors,
  resolveEffective,
  type EffectivePageColors,
  type ThemeKind,
} from "../../../shared/page-colors";
import type { PdfPanels } from "../pdf/panels";
import type { PdfSettings } from "../../settings";

const KEY = "lumiere.pdf.pageColors";

function themeKind(): ThemeKind {
  return vscode.window.activeColorTheme.kind as ThemeKind;
}

function setting(): ReturnType<typeof parsePageColors> {
  return parsePageColors(vscode.workspace.getConfiguration().get(KEY));
}

/** Effective page colors from the setting and (when Follow) the active theme. */
export function effectivePageColors(): EffectivePageColors {
  return resolveEffective(setting(), themeKind());
}

/** Push the current effective mode to every open viewer. */
export function publishPageColors(panels: PdfPanels): void {
  const effective = effectivePageColors();
  for (const panel of panels.all) {
    panel.setPageColors(effective);
  }
}

/** Cycle Follow → Normal → Dark and write the setting. */
export async function cycleAndPublish(
  settings: PdfSettings,
  panels: PdfPanels,
): Promise<void> {
  const next = cyclePageColors(setting());
  await settings.update(KEY, next);
  publishPageColors(panels);
  void vscode.window.setStatusBarMessage(
    `PDF: page colors ${pageColorsLabel(next)}`,
    3_000,
  );
}

/**
 * Follow setting and theme-kind changes. Theme listeners only matter while
 * Follow is selected; setting changes always republish. New panels get the
 * current effective mode.
 */
export function watchPageColors(panels: PdfPanels): vscode.Disposable {
  return vscode.Disposable.from(
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration(KEY)) {
        publishPageColors(panels);
      }
    }),
    vscode.window.onDidChangeActiveColorTheme(() => {
      if (setting() === "follow") {
        publishPageColors(panels);
      }
    }),
    panels.onDidOpen((panel) => {
      panel.setPageColors(effectivePageColors());
    }),
  );
}
