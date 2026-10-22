/**
 * The app's window: the vault's files on the left, open notes as tabs on
 * the right, each tab one of Lumière's editor pages. The server owns
 * vaults and files (src/server); the editor pages own editing (host-node).
 */
import { useReducer } from "react";
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
import { useOpening } from "./opening";
import { noTabs, tabsReducer } from "./tabs";

export function App() {
  useShellTheme();
  const errors = useErrors();
  const vaults = useVaults(errors.report);
  const [tabs, dispatch] = useReducer(tabsReducer, noTabs);
  const opening = useOpening(vaults, dispatch, errors.report);
  useServerEvents(opening.onServerEvent);
  useMenuCommands({ "open-vault": () => opening.openVault() });

  return (
    <>
      <ErrorBanner message={errors.message} onDismiss={errors.dismiss} />
      {vaults.current ? (
        <Workspace
          vault={vaults.current}
          vaults={vaults}
          tabs={tabs}
          dispatch={dispatch}
          opening={opening}
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
