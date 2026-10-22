/**
 * The app's window: the vault's files on the left, open notes as tabs in the
 * middle, the shown note's outline on the right, each tab one of Lumière's
 * editor pages. The server owns vaults, files and the saved layout
 * (src/server); the editor pages own editing (host-node).
 */
import { useEffect, useReducer } from "react";
import { useShortcuts, type CommandHandlers } from "./commands";
import { ErrorBanner } from "./components/ErrorBanner";
import { VaultPicker } from "./components/VaultPicker";
import { Workspace } from "./components/Workspace";
import {
  useErrors,
  useMenuCommands,
  useServerEvents,
  useShellTheme,
  useVaults,
} from "./hooks";
import { useOpening, type Opening } from "./opening";
import {
  noTabs,
  tabToClose,
  tabsReducer,
  type TabsAction,
  type TabsState,
} from "./tabs";
import { closeWindow } from "./tauri";
import { setColorTheme } from "./theme";
import { useUiState, type UiStateHandle } from "./ui-state";

export function App() {
  useShellTheme();
  const errors = useErrors();
  const vaults = useVaults(errors.report);
  const ui = useUiState(errors.report);
  const [tabs, dispatch] = useReducer(tabsReducer, noTabs);
  const opening = useOpening(vaults, dispatch, errors.report);
  useServerEvents(opening.onServerEvent);
  useEffect(() => setColorTheme(ui.state.theme), [ui.state.theme]);
  const commands = windowCommands({ tabs, dispatch, ui, opening });
  useMenuCommands(commands);
  useShortcuts(commands);

  const showsWorkspace = vaults.current !== undefined || tabs.tabs.length > 0;
  return (
    <>
      <ErrorBanner message={errors.message} onDismiss={errors.dismiss} />
      {showsWorkspace ? (
        <Workspace
          vault={vaults.current}
          vaults={vaults}
          tabs={tabs}
          dispatch={dispatch}
          opening={opening}
          ui={ui}
          report={errors.report}
        />
      ) : (
        <VaultPicker
          recent={vaults.recent}
          onOpen={(folder) => opening.openVault(folder)}
        />
      )}
    </>
  );
}

function windowCommands({
  tabs,
  dispatch,
  ui,
  opening,
}: {
  readonly tabs: TabsState;
  readonly dispatch: (action: TabsAction) => void;
  readonly ui: UiStateHandle;
  readonly opening: Opening;
}): CommandHandlers {
  return {
    "open-vault": () => opening.openVault(),
    "open-settings": () => dispatch({ type: "openSettings" }),
    "close-tab": () => {
      const id = tabToClose(tabs);
      if (id) {
        dispatch({ type: "close", id });
      } else {
        void closeWindow();
      }
    },
    "toggle-sidebar": () => ui.update({ sidebar: !ui.state.sidebar }),
    "toggle-outline": () => ui.update({ outline: !ui.state.outline }),
    "theme-system": () => ui.update({ theme: "system" }),
    "theme-light": () => ui.update({ theme: "light" }),
    "theme-dark": () => ui.update({ theme: "dark" }),
  };
}
