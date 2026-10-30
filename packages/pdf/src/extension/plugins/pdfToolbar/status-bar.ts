import * as vscode from "vscode";
import {
  pageColorsLabel,
  parsePageColors,
  resolveEffective,
  type PageColorsSetting,
  type ThemeKind,
} from "../../../shared/page-colors";
import {
  parseVsCodeToolbarMode,
  showStatusBarButtons,
} from "../../../shared/toolbar-settings";
import { pageLabel, zoomLabel } from "../../../shared/view-state";
import type { PdfPanels } from "../pdf/panels";
import {
  HISTORY_COMMAND_IDS,
  TOOLBAR_COMMAND_IDS,
  VIEW_COMMAND_IDS,
  VIEW_CONTROL_COMMAND_IDS,
} from "../../../shared/command-ids";
import { SECTION } from "./preferences";
import { statusBarPriority, type StatusBarEntryId } from "./status-bar-layout";

/** A shortcut as this platform writes it: `key('Ctrl+G', '⌃G')`. */
function key(other: string, mac: string): string {
  return process.platform === "darwin" ? mac : other;
}

type Item = {
  id: StatusBarEntryId;
  name: string;
  text: string;
  tooltip: string;
  command: string;
  button?: true;
};

/**
 * Status bar entries, in their order from left to right (see
 * `STATUS_BAR_ORDER`): history, find, View, page colors, "Page 4 / 15",
 * previous/next page, zoom label and buttons. Optional buttons show only
 * when `toolbar.statusBarButtons` asks for them.
 */
const ITEMS: Item[] = [
  {
    id: "historyBack",
    name: "PDF History Back",
    text: "$(arrow-left)",
    tooltip: "Back to previous location",
    command: HISTORY_COMMAND_IDS.historyBack,
    button: true,
  },
  {
    id: "historyForward",
    name: "PDF History Forward",
    text: "$(arrow-right)",
    tooltip: "Forward to next location",
    command: HISTORY_COMMAND_IDS.historyForward,
    button: true,
  },
  {
    id: "find",
    name: "PDF Find",
    text: "$(search)",
    tooltip: `Find in PDF (${key("Ctrl+F", "⌘F")})`,
    command: VIEW_COMMAND_IDS.find,
    button: true,
  },
  {
    id: "view",
    name: "PDF View",
    text: "$(layout) View",
    tooltip: "Choose zoom, page layout and scrolling",
    command: VIEW_CONTROL_COMMAND_IDS.selectView,
  },
  {
    id: "pageColors",
    name: "PDF Page Colors",
    text: "",
    tooltip: "Cycle page colors: Follow → Normal → Dark",
    command: TOOLBAR_COMMAND_IDS.cyclePageColors,
  },
  {
    id: "page",
    name: "PDF Page",
    text: "",
    tooltip: `Go to Page… (${key("Ctrl+G", "⌃G")})`,
    command: VIEW_COMMAND_IDS.goToPage,
  },
  {
    id: "previousPage",
    name: "PDF Previous Page",
    text: "$(chevron-up)",
    tooltip: `Previous Page (${key("Alt+PageUp", "⌥PageUp")})`,
    command: VIEW_COMMAND_IDS.previousPage,
    button: true,
  },
  {
    id: "nextPage",
    name: "PDF Next Page",
    text: "$(chevron-down)",
    tooltip: `Next Page (${key("Alt+PageDown", "⌥PageDown")})`,
    command: VIEW_COMMAND_IDS.nextPage,
    button: true,
  },
  {
    id: "zoom",
    name: "PDF Zoom",
    text: "",
    tooltip: "Pick a Zoom…",
    command: VIEW_COMMAND_IDS.selectZoom,
  },
  {
    id: "zoomOut",
    name: "PDF Zoom Out",
    text: "$(zoom-out)",
    tooltip: `Zoom Out (${key("Ctrl+-", "⌘-")})`,
    command: VIEW_COMMAND_IDS.zoomOut,
    button: true,
  },
  {
    id: "zoomIn",
    name: "PDF Zoom In",
    text: "$(zoom-in)",
    tooltip: `Zoom In (${key("Ctrl+=", "⌘=")})`,
    command: VIEW_COMMAND_IDS.zoomIn,
    button: true,
  },
];

function themeKind(): ThemeKind {
  return vscode.window.activeColorTheme.kind as ThemeKind;
}

function pageColorsSetting(): PageColorsSetting {
  return parsePageColors(
    vscode.workspace.getConfiguration("lumiere.pdf").get("pageColors"),
  );
}

function pageColorsText(setting: PageColorsSetting): string {
  const label = pageColorsLabel(setting);
  if (setting !== "follow") {
    return `$(color-mode) ${label}`;
  }
  const effective = resolveEffective(setting, themeKind());
  return `$(color-mode) Follow (${pageColorsLabel(effective)})`;
}

export class StatusBar implements vscode.Disposable {
  private readonly items = new Map<string, vscode.StatusBarItem>();
  private readonly subscription: vscode.Disposable;

  constructor(private readonly panels: PdfPanels) {
    for (const item of ITEMS) {
      const entry = vscode.window.createStatusBarItem(
        `lumiere.pdf.${item.id}`,
        vscode.StatusBarAlignment.Right,
        statusBarPriority(item.id),
      );
      entry.name = item.name;
      entry.text = item.text;
      entry.tooltip = item.tooltip;
      entry.command = item.command;
      this.items.set(item.id, entry);
    }
    this.subscription = panels.onDidChange(() => this.update());
    this.update();
  }

  update(): void {
    const view = this.panels.active?.view;
    const panel = this.panels.active;
    const configuration = vscode.workspace.getConfiguration(SECTION);
    const shown =
      view !== undefined &&
      parseVsCodeToolbarMode(configuration.get("mode")) === "chrome";
    const buttons =
      shown &&
      showStatusBarButtons(
        configuration.get("statusBarButtons"),
        vscode.env.appName,
      );
    const colors = pageColorsSetting();
    for (const item of ITEMS) {
      const entry = this.items.get(item.id)!;
      if (!shown || (item.button && !buttons)) {
        entry.hide();
        continue;
      }
      if (item.id === "page") {
        entry.text = pageLabel(view);
      }
      if (item.id === "zoom") {
        entry.text = zoomLabel(view);
      }
      if (item.id === "pageColors") {
        entry.text = pageColorsText(colors);
        entry.tooltip = `Page colors: ${pageColorsLabel(colors)} (click to cycle)`;
      }
      if (item.id === "previousPage") {
        entry.command = view.canGoBack ? item.command : undefined;
      }
      if (item.id === "nextPage") {
        entry.command = view.canGoForward ? item.command : undefined;
      }
      if (item.id === "historyBack") {
        entry.command = panel?.canHistoryBack ? item.command : undefined;
      }
      if (item.id === "historyForward") {
        entry.command = panel?.canHistoryForward ? item.command : undefined;
      }
      entry.show();
    }
  }

  dispose(): void {
    this.subscription.dispose();
    for (const entry of this.items.values()) {
      entry.dispose();
    }
  }
}
