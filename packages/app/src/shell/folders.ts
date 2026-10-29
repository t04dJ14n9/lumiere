/**
 * Which of the file list's folders are open. As in VS Code's Explorer they
 * start closed, open as the reader clicks them, and the ones on the way to
 * the shown note open whenever it changes or the list appears (on the iPad,
 * each time the files card shows). The saved layout keeps them per vault
 * between launches (ui-state.ts).
 */
import { useCallback, useEffect, useMemo, useRef } from "react";
import {
  foldersOf,
  revealFile,
  toggleFolder,
  withFolders,
  type OpenFolders,
} from "./tree-state";
import type { UiStateHandle } from "./ui-state";

export interface OpenFoldersHandle {
  readonly open: OpenFolders;
  toggle(path: string): void;
}

export function useOpenFolders(
  ui: UiStateHandle,
  vault: string,
  activePath: string | undefined,
): OpenFoldersHandle {
  const { state, loaded, update } = ui;
  const open = useMemo(
    () => foldersOf(state.folders, vault),
    [state.folders, vault],
  );
  const save = useCallback(
    (next: OpenFolders) =>
      update({ folders: withFolders(state.folders, vault, next) }),
    [state.folders, vault, update],
  );
  // Until the saved layout is read, a reveal would be lost when it arrives.
  useRevealedNote(loaded ? activePath : undefined, open, save);
  return { open, toggle: (path) => save(toggleFolder(open, path)) };
}

/**
 * Open the way to the shown note once each time it changes, not on every
 * change of the open folders: the reader may close the note's own folder.
 */
function useRevealedNote(
  activePath: string | undefined,
  open: OpenFolders,
  save: (next: OpenFolders) => void,
): void {
  const revealed = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (revealed.current === activePath) {
      return;
    }
    revealed.current = activePath;
    const next = activePath ? revealFile(open, activePath) : open;
    if (next !== open) {
      save(next);
    }
  }, [activePath, open, save]);
}
