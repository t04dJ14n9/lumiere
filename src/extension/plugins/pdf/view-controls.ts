import * as vscode from "vscode";
import {
  PAGE_LAYOUTS,
  SCROLL_DIRECTIONS,
  SCROLL_MODES,
} from "../../../shared/view-options";
import type { ViewerAction } from "../../../shared/view-state";
import type { PdfPanels } from "./panels";

type Choice = vscode.QuickPickItem & { action?: ViewerAction; command?: string };

/** Layout and scrolling commands use exactly the same actions as the viewer's View group. */
export function registerViewControls(panels: PdfPanels): vscode.Disposable {
  const register = (name: string, action: ViewerAction) =>
    vscode.commands.registerCommand(`vscodeEmbedPdf.${name}`, () =>
      panels.active?.act(action),
    );
  return vscode.Disposable.from(
    register("actualSize", { action: "actualSize" }),
    ...PAGE_LAYOUTS.map((item) =>
      register(item.command, {
        action: "setPageLayout",
        pageLayout: item.value,
      }),
    ),
    ...SCROLL_MODES.map((item) =>
      register(item.command, {
        action: "setScrollMode",
        scrollMode: item.value,
      }),
    ),
    ...SCROLL_DIRECTIONS.map((item) =>
      register(item.command, {
        action: "setScrollDirection",
        scrollDirection: item.value,
      }),
    ),
    vscode.commands.registerCommand("vscodeEmbedPdf.selectView", async () => {
      const panel = panels.active;
      const view = panel?.view;
      if (!panel || !view) return;
      const section = (label: string): Choice => ({
        label,
        kind: vscode.QuickPickItemKind.Separator,
      });
      const current = (active: boolean) =>
        active ? { description: "current" } : {};
      const choices: Choice[] = [
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
          ...current(
            !view.fit && (view.zoom === 100 || view.zoom === "actual"),
          ),
          action: { action: "actualSize" },
        },
        { label: "Custom percentage…" },
        section("Page layout"),
        ...PAGE_LAYOUTS.map((item) => ({
          label: item.label,
          ...current(view.pageLayout === item.value),
          action: {
            action: "setPageLayout",
            pageLayout: item.value,
          } as ViewerAction,
        })),
        section("Scrolling"),
        ...SCROLL_MODES.map((item) => ({
          label: item.label,
          ...current(view.scrollMode === item.value),
          action: {
            action: "setScrollMode",
            scrollMode: item.value,
          } as ViewerAction,
        })),
        section("Direction"),
        ...SCROLL_DIRECTIONS.map((item) => ({
          label: item.label,
          ...current(view.scrollDirection === item.value),
          action: {
            action: "setScrollDirection",
            scrollDirection: item.value,
          } as ViewerAction,
        })),
        section("More"),
        {
          label: "$(settings-gear) Settings…",
          command: "vscodeEmbedPdf.openSettings",
        },
      ];
      const choice = await vscode.window.showQuickPick(choices, {
        title: "PDF View",
        placeHolder: "Choose zoom, layout or scrolling",
      });
      if (!choice || panels.active !== panel) return;
      if (choice.action) panel.act(choice.action);
      else if (choice.command)
        await vscode.commands.executeCommand(choice.command);
      else await vscode.commands.executeCommand("vscodeEmbedPdf.selectZoom");
    }),
  );
}
