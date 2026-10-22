/** The shell's tabs: which files are open, in order, and which one shows. */

export interface Tab {
  readonly id: string;
  /** The vault folder (absolute). */
  readonly vault: string;
  /** The file, relative to the vault, with `/`. */
  readonly path: string;
}

export interface TabsState {
  readonly tabs: readonly Tab[];
  readonly active: string | undefined;
}

export type TabsAction =
  | { readonly type: "open"; readonly vault: string; readonly path: string }
  | { readonly type: "close"; readonly id: string }
  | { readonly type: "activate"; readonly id: string };

export const noTabs: TabsState = { tabs: [], active: undefined };

export function tabId(vault: string, path: string): string {
  return `${vault}\u0000${path}`;
}

export function tabsReducer(state: TabsState, action: TabsAction): TabsState {
  switch (action.type) {
    case "open": {
      const id = tabId(action.vault, action.path);
      const tabs = state.tabs.some((tab) => tab.id === id)
        ? state.tabs
        : [...state.tabs, { id, vault: action.vault, path: action.path }];
      return { tabs, active: id };
    }
    case "activate":
      return state.tabs.some((tab) => tab.id === action.id)
        ? { ...state, active: action.id }
        : state;
    case "close": {
      const index = state.tabs.findIndex((tab) => tab.id === action.id);
      if (index < 0) {
        return state;
      }
      const tabs = state.tabs.filter((tab) => tab.id !== action.id);
      if (state.active !== action.id) {
        return { tabs, active: state.active };
      }
      // Closing the shown tab shows its right neighbour, else its left one.
      const next = tabs[Math.min(index, tabs.length - 1)];
      return { tabs, active: next?.id };
    }
  }
}
