import * as vscode from "vscode";
import {
  PAGE_LAYOUTS,
  SCROLL_DIRECTIONS,
  SCROLL_MODES,
} from "../../../shared/view-options";
import type { ViewerAction, ViewState } from "../../../shared/view-state";
import type { PdfPanels } from "./panels";
import {
  SETTINGS_COMMAND_IDS,
  VIEW_COMMAND_IDS,
  VIEW_CONTROL_COMMAND_IDS,
} from "../../../shared/command-ids";

type Choice = vscode.QuickPickItem & {
  action?: ViewerAction;
  command?: string;
};

/**
 * The View picker. Layout and scrolling commands are registered with the
 * other view actions (`registerViewCommands`), with exactly the same actions
 * as the viewer's View group.
 */
export function registerViewControls(panels: PdfPanels): vscode.Disposable {
  return vscode.commands.registerCommand(
    VIEW_CONTROL_COMMAND_IDS.selectView,
    () => selectView(panels),
  );
}

/** The View picker: zoom, page layout, scrolling and direction in one list. */
async function selectView(panels: PdfPanels): Promise<void> {
  const panel = panels.active;
  const view = panel?.view;
  if (!panel || !view) {
    return;
  }
  const choice = await vscode.window.showQuickPick(viewChoices(view), {
    title: "PDF View",
    placeHolder: "Choose zoom, layout or scrolling",
  });
  if (!choice || panels.active !== panel) {
    return;
  }
  if (choice.action) {
    panel.act(choice.action);
  } else {
    // "Custom percentage…" opens the zoom picker.
    await vscode.commands.executeCommand(
      choice.command ?? VIEW_COMMAND_IDS.selectZoom,
    );
  }
}

const section = (label: string): Choice => ({
  label,
  kind: vscode.QuickPickItemKind.Separator,
});

const current = (active: boolean) => (active ? { description: "current" } : {});

function viewChoices(view: ViewState): Choice[] {
  return [
    section("Zoom"),
    {
      label: "Fit width",
      ...current(view.fit === "width"),
      action: { action: "fitWidth" },
    },
    {
      label: "Fit page",
      ...current(view.fit === "page"),
      action: { action: "fitPage" },
    },
    {
      label: "Actual size (100%)",
      ...current(!view.fit && (view.zoom === 100 || view.zoom === "actual")),
      action: { action: "actualSize" },
    },
    { label: "Custom percentage…" },
    section("Page layout"),
    ...PAGE_LAYOUTS.map((item) => ({
      label: item.label,
      ...current(view.pageLayout === item.value),
      action: { action: "setPageLayout", pageLayout: item.value } as const,
    })),
    section("Scrolling"),
    ...SCROLL_MODES.map((item) => ({
      label: item.label,
      ...current(view.scrollMode === item.value),
      action: { action: "setScrollMode", scrollMode: item.value } as const,
    })),
    section("Direction"),
    ...SCROLL_DIRECTIONS.map((item) => ({
      label: item.label,
      ...current(view.scrollDirection === item.value),
      action: {
        action: "setScrollDirection",
        scrollDirection: item.value,
      } as const,
    })),
    section("More"),
    {
      label: "$(settings-gear) Settings…",
      command: SETTINGS_COMMAND_IDS.openSettings,
    },
  ];
}
