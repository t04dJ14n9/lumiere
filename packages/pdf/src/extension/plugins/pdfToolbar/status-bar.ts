import * as vscode from "vscode";
import type { OperatingSystem } from "@workshop/platform";
import {
  parseToolbarMode,
  showStatusBarButtons,
} from "../../../shared/toolbar-settings";
import { pageLabel, zoomLabel } from "../../../shared/view-state";
import type { PdfPanels } from "../pdf/panels";
import {
  VIEW_COMMAND_IDS,
  VIEW_CONTROL_COMMAND_IDS,
} from "../pdf/registered-commands";
import { SECTION } from "./preferences";

/** A tooltip, with the item's shortcut as the user's platform writes it. */
function tooltipOf(item: Item, os: OperatingSystem): string {
  if (!item.shortcut) {
    return item.tooltip;
  }
  const [other, mac] = item.shortcut;
  return `${item.tooltip} (${os.platform === "darwin" ? mac : other})`;
}

type Item = {
  id: string;
  name: string;
  text: string;
  tooltip: string;
  /** Its keyboard shortcut, as other platforms and the Mac write it. */
  shortcut?: [other: string, mac: string];
  command: string;
  priority: number;
  button?: true;
};

/**
 * Status bar entries, from left to right: previous page, "Page 4 / 15"
 * (click to go to a page), next page, zoom out, "Fit Width (164%)" (click
 * to pick a zoom), zoom in, find. The buttons show only when
 * `toolbar.statusBarButtons` asks for them.
 */
const ITEMS: Item[] = [
  {
    id: "previousPage",
    name: "PDF Previous Page",
    text: "$(chevron-up)",
    tooltip: "Previous Page",
    shortcut: ["Alt+PageUp", "⌥PageUp"],
    command: VIEW_COMMAND_IDS.previousPage,
    priority: 106,
    button: true,
  },
  {
    id: "page",
    name: "PDF Page",
    text: "",
    tooltip: "Go to Page…",
    shortcut: ["Ctrl+G", "⌃G"],
    command: VIEW_COMMAND_IDS.goToPage,
    priority: 105,
  },
  {
    id: "nextPage",
    name: "PDF Next Page",
    text: "$(chevron-down)",
    tooltip: "Next Page",
    shortcut: ["Alt+PageDown", "⌥PageDown"],
    command: VIEW_COMMAND_IDS.nextPage,
    priority: 104,
    button: true,
  },
  {
    id: "zoomOut",
    name: "PDF Zoom Out",
    text: "$(zoom-out)",
    tooltip: "Zoom Out",
    shortcut: ["Ctrl+-", "⌘-"],
    command: VIEW_COMMAND_IDS.zoomOut,
    priority: 103,
    button: true,
  },
  {
    id: "zoom",
    name: "PDF Zoom",
    text: "",
    tooltip: "Pick a Zoom…",
    command: VIEW_COMMAND_IDS.selectZoom,
    priority: 102,
  },
  {
    id: "zoomIn",
    name: "PDF Zoom In",
    text: "$(zoom-in)",
    tooltip: "Zoom In",
    shortcut: ["Ctrl+=", "⌘="],
    command: VIEW_COMMAND_IDS.zoomIn,
    priority: 101,
    button: true,
  },
  {
    id: "find",
    name: "PDF Find",
    text: "$(search)",
    tooltip: "Find in PDF",
    shortcut: ["Ctrl+F", "⌘F"],
    command: VIEW_COMMAND_IDS.find,
    priority: 100,
    button: true,
  },
  {
    id: "view",
    name: "PDF View",
    text: "$(layout) View",
    tooltip: "Choose zoom, page layout and scrolling",
    command: VIEW_CONTROL_COMMAND_IDS.selectView,
    priority: 99,
  },
];

export class StatusBar implements vscode.Disposable {
  private readonly items = new Map<string, vscode.StatusBarItem>();
  private readonly subscription: vscode.Disposable;

  constructor(
    private readonly panels: PdfPanels,
    os: OperatingSystem,
  ) {
    for (const item of ITEMS) {
      const entry = vscode.window.createStatusBarItem(
        `pdfWorkshop.${item.id}`,
        vscode.StatusBarAlignment.Right,
        item.priority,
      );
      entry.name = item.name;
      entry.text = item.text;
      entry.tooltip = tooltipOf(item, os);
      entry.command = item.command;
      this.items.set(item.id, entry);
    }
    this.subscription = panels.onDidChange(() => this.update());
    this.update();
  }

  update(): void {
    const view = this.panels.active?.view;
    const configuration = vscode.workspace.getConfiguration(SECTION);
    const shown =
      view !== undefined &&
      parseToolbarMode(configuration.get("mode")) === "chrome";
    const buttons =
      shown &&
      showStatusBarButtons(
        configuration.get("statusBarButtons"),
        vscode.env.appName,
      );
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
      if (item.id === "previousPage") {
        entry.command = view.canGoBack ? item.command : undefined;
      }
      if (item.id === "nextPage") {
        entry.command = view.canGoForward ? item.command : undefined;
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
