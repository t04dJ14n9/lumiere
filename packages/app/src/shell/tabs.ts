/**
 * The window's tabs: which notes are open, in order, and which tab shows.
 * Settings opens as a tab too, as in VS Code.
 */

export interface NoteTab {
  readonly kind: "note";
  readonly id: string;
  /** The vault folder (absolute). */
  readonly vault: string;
  /** The file, relative to the vault, with `/`. */
  readonly path: string;
}

export interface SettingsTab {
  readonly kind: "settings";
  readonly id: typeof SETTINGS_TAB;
}

export type Tab = NoteTab | SettingsTab;

export interface TabsState {
  readonly tabs: readonly Tab[];
  readonly active: string | undefined;
}

export type TabsAction =
  | { readonly type: "open"; readonly vault: string; readonly path: string }
  | { readonly type: "openSettings" }
  | { readonly type: "close"; readonly id: string }
  | { readonly type: "activate"; readonly id: string };

export const SETTINGS_TAB = "settings";

export const noTabs: TabsState = { tabs: [], active: undefined };

export function tabId(vault: string, path: string): string {
  return `${vault}\u0000${path}`;
}

/**
 * The tab ⌘W closes: the shown one while there are others. With one tab or
 * none it closes nothing, and ⌘W closes the window instead.
 */
export function tabToClose(state: TabsState): string | undefined {
  return state.tabs.length > 1 ? state.active : undefined;
}

/** What a tab is called in the tab strip. */
export function tabTitle(tab: Tab): string {
  return tab.kind === "settings"
    ? "Settings"
    : tab.path
        .slice(tab.path.lastIndexOf("/") + 1)
        .replace(/\.(md|markdown)$/i, "");
}

export function tabsReducer(state: TabsState, action: TabsAction): TabsState {
  switch (action.type) {
    case "open":
      return show(state, {
        kind: "note",
        id: tabId(action.vault, action.path),
        vault: action.vault,
        path: action.path,
      });
    case "openSettings":
      return show(state, { kind: "settings", id: SETTINGS_TAB });
    case "activate":
      return state.tabs.some((tab) => tab.id === action.id)
        ? { ...state, active: action.id }
        : state;
    case "close":
      return close(state, action.id);
  }
}

/** Show a tab, opening it after the others when it is not open yet. */
function show(state: TabsState, tab: Tab): TabsState {
  const tabs = state.tabs.some((item) => item.id === tab.id)
    ? state.tabs
    : [...state.tabs, tab];
  return { tabs, active: tab.id };
}

/** Closing the shown tab shows its right neighbour, else its left one. */
function close(state: TabsState, id: string): TabsState {
  const index = state.tabs.findIndex((tab) => tab.id === id);
  if (index < 0) {
    return state;
  }
  const tabs = state.tabs.filter((tab) => tab.id !== id);
  if (state.active !== id) {
    return { tabs, active: state.active };
  }
  return { tabs, active: tabs[Math.min(index, tabs.length - 1)]?.id };
}
