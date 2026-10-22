import * as vscode from "vscode";
import { MARKDOWN_EDITOR } from "../shared/editor-provider";

/** Which view the toggle should leave open. */
export type ToggleKeep = "text" | "lumiere";

/** Facts about one tab, free of VS Code types for unit tests. */
export interface ToggleTabFacts {
  readonly uri: string | undefined;
  readonly kind: "lumiere" | "text" | "other";
  readonly isDirty: boolean;
}

/**
 * After `vscode.openWith` switches Lumière ↔ text, VS Code leaves the previous
 * view as a second tab of the same URI (BH-011 / BH-003). Close clean siblings
 * of the other kind in the active group, matching reclaim's leave-behind close.
 * Dirty tabs stay so unsaved text is not discarded.
 */
export async function closeToggleSiblingTabs(
  uri: string,
  keep: ToggleKeep,
): Promise<void> {
  const group = vscode.window.tabGroups.activeTabGroup;
  const victims = group.tabs.filter((tab) =>
    isToggleLeaveBehind(tabFacts(tab), uri, keep),
  );
  for (const tab of victims) {
    await vscode.window.tabGroups.close(tab, true);
  }
}

/** Pure match used by unit tests. */
export function isToggleLeaveBehind(
  tab: ToggleTabFacts,
  uri: string,
  keep: ToggleKeep,
): boolean {
  if (tab.isDirty || tab.uri !== uri) {
    return false;
  }
  if (keep === "text") {
    return tab.kind === "lumiere";
  }
  return tab.kind === "text";
}

function tabFacts(tab: vscode.Tab): ToggleTabFacts {
  const input = tab.input;
  if (input instanceof vscode.TabInputCustom) {
    return {
      uri: input.uri.toString(),
      kind: input.viewType === MARKDOWN_EDITOR.viewType ? "lumiere" : "other",
      isDirty: tab.isDirty,
    };
  }
  if (input instanceof vscode.TabInputText) {
    return {
      uri: input.uri.toString(),
      kind: "text",
      isDirty: tab.isDirty,
    };
  }
  return { uri: undefined, kind: "other", isDirty: tab.isDirty };
}
