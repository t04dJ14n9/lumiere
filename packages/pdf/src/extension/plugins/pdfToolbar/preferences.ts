import * as vscode from "vscode";
import {
  parseFloatingDock,
  parseVsCodeToolbarMode,
  type FloatingDock,
  type ToolbarSettings,
} from "../../../shared/toolbar-settings";

export const SECTION = "lumiere.pdf.toolbar";
const DOCK_KEY = "lumiere.pdf.floatingDock";

/**
 * The toolbar settings the viewers need: the mode from the settings, and
 * the floating bar's edge, which the reader picks by dragging it and which
 * is kept in the extension's global state rather than in the settings.
 */
export class ToolbarPreferences implements vscode.Disposable {
  private readonly changed = new vscode.EventEmitter<void>();
  readonly onDidChange = this.changed.event;
  private readonly subscription = vscode.workspace.onDidChangeConfiguration(
    (event) => {
      if (event.affectsConfiguration(SECTION)) {
        this.changed.fire();
      }
    },
  );

  constructor(private readonly state: vscode.Memento) {}

  get settings(): ToolbarSettings {
    return {
      mode: parseVsCodeToolbarMode(
        vscode.workspace.getConfiguration(SECTION).get("mode"),
      ),
      dock: parseFloatingDock(this.state.get(DOCK_KEY)),
    };
  }

  async setDock(dock: FloatingDock): Promise<void> {
    if (dock === this.settings.dock) {
      return;
    }
    await this.state.update(DOCK_KEY, dock);
    this.changed.fire();
  }

  dispose(): void {
    this.subscription.dispose();
    this.changed.dispose();
  }
}
