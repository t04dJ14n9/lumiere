import {
  watch,
  existsSync,
  statSync,
  readFileSync,
  realpathSync,
  type FSWatcher,
} from "node:fs";
import { join, isAbsolute, resolve } from "node:path";
import type { RepositoryWatch } from "./git-watch";

/** Structural change event matching RepositoryWatch's GitEvent shape. */
type GitEvent = (listener: () => void) => { dispose(): unknown };

/** Resolve symlinks when present so containment checks match `git rev-parse`. */
export function canonicalPath(path: string): string {
  try {
    return realpathSync(path);
  } catch {
    return path;
  }
}

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

/** Shared object/config directory for linked worktrees (`commondir`). */
export function resolveCommonDir(gitDir: string): string | undefined {
  try {
    const text = readFileSync(join(gitDir, "commondir"), "utf8").trim();
    if (!text) {
      return undefined;
    }
    const common = isAbsolute(text) ? text : resolve(gitDir, text);
    return existsSync(common) ? common : undefined;
  } catch {
    return undefined;
  }
}

function coalesce(onChange: () => void): {
  fire(): void;
  dispose(): void;
} {
  let disposed = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  return {
    fire() {
      if (disposed) {
        return;
      }
      if (timer !== undefined) {
        clearTimeout(timer);
      }
      timer = setTimeout(() => {
        timer = undefined;
        if (disposed) {
          return;
        }
        try {
          onChange();
        } catch {
          /* Observers own their reporting. */
        }
      }, 0);
    },
    dispose() {
      disposed = true;
      if (timer !== undefined) {
        clearTimeout(timer);
        timer = undefined;
      }
    },
  };
}

function trackPath(
  watchers: FSWatcher[],
  target: string,
  fire: () => void,
  recursive = false,
): void {
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
}

function trackMetadataTree(
  watchers: FSWatcher[],
  dir: string,
  fire: () => void,
): void {
  // Directory watch keeps receiving events after Git replaces files in-place.
  trackPath(watchers, dir, fire);
  trackPath(watchers, join(dir, "refs"), fire, true);
  trackPath(watchers, join(dir, "logs"), fire, true);
}

/**
 * Watch git metadata that changes on amend / checkout / config updates.
 * Directory watches (not bare file watches) survive Git's atomic replace of
 * `config` / `HEAD`. Linked worktrees also watch `commondir` shared metadata.
 */
export function watchGitMetadata(
  gitDir: string,
  onChange: () => void,
): { dispose(): void } {
  const watchers: FSWatcher[] = [];
  const signals = coalesce(onChange);
  trackMetadataTree(watchers, gitDir, () => signals.fire());
  const common = resolveCommonDir(gitDir);
  if (common && canonicalPath(common) !== canonicalPath(gitDir)) {
    trackMetadataTree(watchers, common, () => signals.fire());
  }
  return {
    dispose() {
      signals.dispose();
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
