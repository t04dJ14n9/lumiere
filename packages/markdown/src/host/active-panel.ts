/** What the active tab shows, reduced to what decides panel activity. */
export interface ActiveTab {
  groupColumn: number | undefined;
  viewType: string | undefined;
  uri: string | undefined;
}

/**
 * Whether a workbench panel is the active editor. VS Code reports
 * `panel.active` as soon as the panel regains focus (for example after a
 * text editor opened over it is closed), while the tab model can lag behind,
 * so either signal counts.
 */
export function panelIsActive(
  panel: { active: boolean; viewColumn: number | undefined },
  tab: ActiveTab,
  expected: { viewType: string; uri: string },
): boolean {
  if (panel.active) {
    return true;
  }
  return (
    tab.groupColumn === panel.viewColumn &&
    tab.viewType === expected.viewType &&
    tab.uri === expected.uri
  );
}
