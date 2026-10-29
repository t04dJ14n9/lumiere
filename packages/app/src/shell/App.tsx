/**
 * The app's window: the vault's files on the left, open notes as tabs in the
 * middle, the shown note's outline on the right, each tab one of Lumière's
 * editor pages. The server owns vaults, files and the saved layout
 * (src/server); the editor pages own editing (host-node).
 */
import { useEffect, useReducer, useState } from "react";
import { useShortcuts, type CommandHandlers } from "./commands";
import { CommandPalette } from "./components/CommandPalette";
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
import { usePanels, type Panels } from "./panels";
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
  const panels = usePanels(ui);
  const [tabs, dispatch] = useReducer(tabsReducer, noTabs);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const opening = useOpening(vaults, dispatch, errors.report);
  useServerEvents(opening.onServerEvent);
  useEffect(() => setColorTheme(ui.state.theme), [ui.state.theme]);
  const commands = windowCommands({
    tabs,
    dispatch,
    ui,
    panels,
    opening,
    onTogglePalette: () => setPaletteOpen((open) => !open),
  });
  useMenuCommands(commands);
  useShortcuts(commands);

  const showsWorkspace = vaults.current !== undefined || tabs.tabs.length > 0;
  return (
    <>
      <ErrorBanner message={errors.message} onDismiss={errors.dismiss} />
      {showsWorkspace && !opening.pickingVault ? (
        <Workspace
          vault={vaults.current}
          vaults={vaults}
          tabs={tabs}
          dispatch={dispatch}
          opening={opening}
          ui={ui}
          panels={panels}
          report={errors.report}
          onCommandPalette={() => setPaletteOpen(true)}
        />
      ) : (
        <VaultPicker
          recent={vaults.recent}
          onOpen={(folder) => opening.openVault(folder)}
          onCancel={
            showsWorkspace ? () => opening.cancelPickVault() : undefined
          }
        />
      )}
      <CommandPalette
        open={paletteOpen}
        handlers={commands}
        onClose={() => setPaletteOpen(false)}
        report={errors.report}
      />
    </>
  );
}

function windowCommands({
  tabs,
  dispatch,
  ui,
  panels,
  opening,
  onTogglePalette,
}: {
  readonly tabs: TabsState;
  readonly dispatch: (action: TabsAction) => void;
  readonly ui: UiStateHandle;
  readonly panels: Panels;
  readonly opening: Opening;
  readonly onTogglePalette: () => void;
}): CommandHandlers {
  return {
    "open-vault": () => opening.openVault(),
    "open-settings": () => dispatch({ type: "openSettings" }),
    "command-palette": onTogglePalette,
    "close-tab": () => {
      const id = tabToClose(tabs);
      if (id) {
        dispatch({ type: "close", id });
      } else {
        void closeWindow();
      }
    },
    "next-tab": () => dispatch({ type: "step", by: 1 }),
    "previous-tab": () => dispatch({ type: "step", by: -1 }),
    "last-tab": () => dispatch({ type: "last" }),
    "toggle-sidebar": () => panels.toggle("sidebar"),
    "toggle-outline": () => panels.toggle("outline"),
    "theme-system": () => ui.update({ theme: "system" }),
    "theme-light": () => ui.update({ theme: "light" }),
    "theme-dark": () => ui.update({ theme: "dark" }),
  };
}
