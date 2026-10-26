/**
 * Watching one file the way VS Code's file watchers do: the file may not
 * exist yet, nor the folders above it (a vault's `.obsidian/app.json`
 * before Obsidian ever opened it), and the listener still hears it appear.
 */
import { statSync, watch, type FSWatcher } from "node:fs";
import * as path from "node:path";

/**
 * Calls `listener` when `file` changes, appears or goes away. The nearest
 * folder that exists is watched, not the file: editors that save by
 * renaming a new file over the old one would end a watch on the file.
 */
export function watchFile(file: string, listener: () => void): () => void {
  let watcher: FSWatcher | undefined;
  let stopped = false;
  const arm = (): void => {
    watcher?.close();
    watcher = undefined;
    const nearest = nearestFolder(file);
    if (stopped || !nearest) {
      return;
    }
    const { folder, name } = nearest;
    const holdsFile = folder === path.dirname(file);
    try {
      const current = watch(folder, (_event, changed) => {
        if (changed !== null && changed.toString() !== name) {
          return;
        }
        if (holdsFile) {
          listener();
          return;
        }
        // A folder on the way to the file appeared: watch from deeper down.
        arm();
        if (exists(file)) {
          listener();
        }
      });
      current.on("error", () => current.close());
      watcher = current;
    } catch {
      // The folder went away between finding it and watching it.
    }
  };
  arm();
  return () => {
    stopped = true;
    watcher?.close();
  };
}

/** The deepest existing folder on the way to `file`, and the name in it that leads there. */
function nearestFolder(
  file: string,
): { folder: string; name: string } | undefined {
  let name = path.basename(file);
  let folder = path.dirname(file);
  while (!isFolder(folder)) {
    const parent = path.dirname(folder);
    if (parent === folder) {
      return undefined;
    }
    name = path.basename(folder);
    folder = parent;
  }
  return { folder, name };
}

function isFolder(target: string): boolean {
  return statSync(target, { throwIfNoEntry: false })?.isDirectory() ?? false;
}

function exists(target: string): boolean {
  return statSync(target, { throwIfNoEntry: false }) !== undefined;
}
