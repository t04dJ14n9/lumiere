/**
 * How things get opened: a vault from the picker or the menu, a file a page
 * asked for (a followed link), and a note the server announces (a file
 * opened from Finder or the command line reaches the window this way).
 */
import { useCallback, useMemo, useState, type Dispatch } from "react";
import { isNotePath, relativeTo, type ServerEvent } from "./api";
import { backend } from "./backend";
import type { VaultState } from "./hooks";
import type { TabsAction } from "./tabs";

export interface Opening {
  /** Open a folder as a vault; with no folder, ask with the native picker or folder dialog. */
  openVault(folder?: string): void;
  /** Close an open vault; its recent entry remains. */
  closeVault(folder: string): void;
  /** Whether the browser-mode folder picker is open over the workspace. */
  readonly pickingVault: boolean;
  cancelPickVault(): void;
  /** A file by absolute path: a tab when an open vault holds it, else the server decides. */
  openPath(path: string): void;
  onServerEvent(event: ServerEvent): void;
}

export function useOpening(
  vaults: VaultState,
  dispatch: Dispatch<TabsAction>,
  report: (work: Promise<unknown>) => void,
): Opening {
  const [pickingVault, setPickingVault] = useState(false);
  const cancelPickVault = useCallback(() => setPickingVault(false), []);
  const openVault = useCallback(
    (folder?: string) => chooseVault(folder, setPickingVault, report),
    [report],
  );
  const { reload, select, refreshFiles } = vaults;
  const closeVault = useCallback(
    (folder: string) =>
      report(backend().vaults.close(folder).then(() => reload())),
    [reload, report],
  );
  const openPath = useCallback(
    (path: string) =>
      openNotePath({ path, vaults, refreshFiles, dispatch, report }),
    [vaults, refreshFiles, dispatch, report],
  );
  const onServerEvent = useCallback(
    (event: ServerEvent) => {
      if (event.type === "vaults") {
        report(reload().then(() => event.added && select(event.added)));
      } else if (event.type === "open" && isNotePath(event.path)) {
        select(event.vault);
        if (!vaults.files.some((entry) => entry.path === event.path)) {
          refreshFiles();
        }
        dispatch({ type: "open", vault: event.vault, path: event.path });
      }
    },
    [vaults.files, reload, select, refreshFiles, dispatch, report],
  );
  return useMemo(
    () => ({
      openVault,
      closeVault,
      pickingVault,
      cancelPickVault,
      openPath,
      onServerEvent,
    }),
    [
      openVault,
      closeVault,
      pickingVault,
      cancelPickVault,
      openPath,
      onServerEvent,
    ],
  );
}

function chooseVault(
  folder: string | undefined,
  setPickingVault: (picking: boolean) => void,
  report: (work: Promise<unknown>) => void,
): void {
  const host = backend();
  if (folder !== undefined) {
    setPickingVault(false);
    report(host.vaults.add(folder));
  } else if (host.pickFolder) {
    report(
      host.pickFolder().then((chosen) =>
        chosen ? host.vaults.add(chosen) : undefined,
      ),
    );
  } else if (host.typesPaths) {
    setPickingVault(true);
  }
}

function openNotePath({
  path,
  vaults,
  refreshFiles,
  dispatch,
  report,
}: {
  readonly path: string;
  readonly vaults: VaultState;
  readonly refreshFiles: () => void;
  readonly dispatch: Dispatch<TabsAction>;
  readonly report: (work: Promise<unknown>) => void;
}): void {
  if (!isNotePath(path)) {
    return;
  }
  for (const vault of vaults.open) {
    const relative = relativeTo(vault, path);
    if (relative !== undefined) {
      if (!vaults.files.some((entry) => entry.path === relative)) {
        refreshFiles();
      }
      dispatch({ type: "open", vault, path: relative });
      return;
    }
  }
  report(backend().vaults.open(path));
}
