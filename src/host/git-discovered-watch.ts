import {
  watch,
  existsSync,
  statSync,
  readFileSync,
  type FSWatcher,
} from "node:fs";
import { join, isAbsolute, resolve } from "node:path";
import type { RepositoryWatch } from "./git-watch";

/** Structural change event matching RepositoryWatch's GitEvent shape. */
type GitEvent = (listener: () => void) => { dispose(): unknown };

/**
 * Resolve the git directory for a work tree root (handles `.git` files used by
 * linked worktrees and some submodules).
 */
export function resolveGitDir(rootPath: string): string | undefined {
  const marker = join(rootPath, ".git");
  try {
    const info = statSync(marker);
    if (info.isDirectory()) {
      return marker;
    }
    if (!info.isFile()) {
      return undefined;
    }
    const text = readFileSync(marker, "utf8");
    const match = /^gitdir:\s*(.+)$/m.exec(text);
    if (!match) {
      return undefined;
    }
    const gitdir = match[1]!.trim();
    return isAbsolute(gitdir) ? gitdir : resolve(rootPath, gitdir);
  } catch {
    return undefined;
  }
}

/**
 * Watch git metadata that changes on amend / checkout / config updates.
 * Uses Node fs.watch so `.git` exclusions in VS Code's FileSystemWatcher do not
 * silently drop HEAD/refs updates on the empty-window discovery path.
 */
export function watchGitMetadata(
  gitDir: string,
  onChange: () => void,
): { dispose(): void } {
  const watchers: FSWatcher[] = [];
  let disposed = false;
  const fire = (): void => {
    if (disposed) {
      return;
    }
    try {
      onChange();
    } catch {
      /* Observers own their reporting. */
    }
  };
  const track = (target: string, recursive = false): void => {
    if (!existsSync(target)) {
      return;
    }
    try {
      watchers.push(
        recursive
          ? watch(target, { recursive: true }, fire)
          : watch(target, fire),
      );
    } catch {
      /* Missing or unwatchable paths are skipped; blame still works once. */
    }
  };
  track(join(gitDir, "HEAD"));
  track(join(gitDir, "config"));
  track(join(gitDir, "COMMIT_EDITMSG"));
  track(join(gitDir, "refs"), true);
  track(join(gitDir, "logs", "HEAD"));
  return {
    dispose() {
      disposed = true;
      for (const watcher of watchers.splice(0)) {
        try {
          watcher.close();
        } catch {
          /* Best-effort close. */
        }
      }
    },
  };
}

/** Fan-out helper so RepositoryWatch and the FS watcher share one event. */
function changeSource(): {
  event: GitEvent;
  fire(): void;
  dispose(): void;
} {
  const listeners = new Set<() => void>();
  return {
    event(listener) {
      listeners.add(listener);
      return {
        dispose() {
          listeners.delete(listener);
        },
      };
    },
    fire() {
      for (const listener of listeners) {
        listener();
      }
    },
    dispose() {
      listeners.clear();
    },
  };
}

/**
 * Enroll a filesystem-discovered root in RepositoryWatch with the same
 * generation advance + publish path API repositories use.
 */
export function bindDiscoveredRoot(
  watch: RepositoryWatch,
  rootUri: string,
  rootPath: string,
): { dispose(): void } | undefined {
  const gitDir = resolveGitDir(rootPath);
  if (!gitDir) {
    return undefined;
  }
  const change = changeSource();
  const fsWatch = watchGitMetadata(gitDir, () => change.fire());
  watch.enrollDiscovered(rootUri, change.event);
  return {
    dispose() {
      fsWatch.dispose();
      change.dispose();
    },
  };
}
