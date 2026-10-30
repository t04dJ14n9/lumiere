import * as vscode from "vscode";
import { parseVsCodeToolbarMode } from "../../../shared/toolbar-settings";
import type { PdfSettings } from "../../settings";
import { SECTION } from "./preferences";

type VsCodeToolbarMode = "chrome" | "none";

const MODE_CHOICES: {
  mode: VsCodeToolbarMode;
  label: string;
  detail: string;
}[] = [
  {
    mode: "chrome",
    label: "$(layout-statusbar) Status Bar",
    detail:
      "Page, zoom, View, page colors and navigation on the VS Code status bar",
  },
  {
    mode: "none",
    label: "$(eye-closed) None",
    detail:
      "No status-bar PDF entries: keyboard shortcuts, menus and the command palette only",
  },
];

/** Ask where the controls go, and save the answer in the setting the Settings editor shows. */
export async function selectToolbarMode(settings: PdfSettings): Promise<void> {
  const current = parseVsCodeToolbarMode(
    vscode.workspace.getConfiguration(SECTION).get("mode"),
  );
  const choice = await vscode.window.showQuickPick(
    MODE_CHOICES.map((choice) => ({
      ...choice,
      ...(choice.mode === current ? { description: "current" } : {}),
    })),
    {
      title: "PDF Viewer Controls",
      placeHolder: "Where should the page, zoom and find controls be?",
    },
  );
  if (choice && choice.mode !== current) {
    await settings.update(`${SECTION}.mode`, choice.mode);
  }
}
