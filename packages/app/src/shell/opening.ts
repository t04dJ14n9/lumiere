/**
 * How things get opened: a vault from the picker or the menu, a file a page
 * asked for (a followed link), and a note the server announces (a file
 * opened from Finder or the command line reaches the window this way).
 */
import { useCallback, useMemo, type Dispatch } from "react";
import { api, relativeTo, type ServerEvent } from "./api";
import type { VaultState } from "./hooks";
import type { TabsAction } from "./tabs";
import { pickFolder } from "./tauri";

export interface Opening {
  /** Open a folder as a vault; with no folder, ask with the native picker. */
  openVault(folder?: string): void;
  /** A file by absolute path: a tab when an open vault holds it, else the server decides. */
  openPath(path: string): void;
  onServerEvent(event: ServerEvent): void;
}

export function useOpening(
  vaults: VaultState,
  dispatch: Dispatch<TabsAction>,
  report: (work: Promise<unknown>) => void,
): Opening {
  const openVault = useCallback(
    (folder?: string) =>
      report(
        (async () => {
          const chosen = folder ?? (await pickFolder());
          if (chosen) {
            await api.addVault(chosen);
          }
        })(),
      ),
    [report],
  );
  const openPath = useCallback(
    (path: string) => {
      for (const vault of vaults.open) {
        const relative = relativeTo(vault, path);
        if (relative !== undefined) {
          dispatch({ type: "open", vault, path: relative });
          return;
        }
      }
      report(api.open(path));
    },
    [vaults.open, dispatch, report],
  );
  const { reload, select } = vaults;
  const onServerEvent = useCallback(
    (event: ServerEvent) => {
      if (event.type === "vaults") {
        report(reload().then(() => event.added && select(event.added)));
      } else if (event.type === "open") {
        select(event.vault);
        dispatch({ type: "open", vault: event.vault, path: event.path });
      }
    },
    [reload, select, dispatch, report],
  );
  return useMemo(
    () => ({ openVault, openPath, onServerEvent }),
    [openVault, openPath, onServerEvent],
  );
}
