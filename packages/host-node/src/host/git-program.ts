/**
 * Which `git` the Node host runs. On macOS, `/usr/bin/git` is a stand-in
 * that asks to install Xcode's command-line tools when they are missing: a
 * dialog nobody asked for, the moment a note opens (blame and the change
 * gutter are on by default). VS Code's git extension asks `xcode-select -p`
 * before using that stand-in; so does this, and without the tools Git is
 * unavailable, as when git is not installed.
 */
import { execFile } from "node:child_process";
import { realpathSync, statSync } from "node:fs";
import * as path from "node:path";

const XCODE_STAND_IN = "/usr/bin/git";

export interface GitSearch {
  readonly platform: NodeJS.Platform;
  /** The PATH to look along. */
  readonly path: string;
  /** Whether Xcode's tools are there (`xcode-select -p`); never offers to install them. */
  hasDeveloperTools(): Promise<boolean>;
}

/** The `git` to run, or undefined when running one would not be git. */
export async function findGit(
  search: GitSearch = systemSearch(),
): Promise<string | undefined> {
  if (search.platform !== "darwin") {
    // Elsewhere the PATH's git is git itself, and a missing one fails to start.
    return "git";
  }
  const found = firstFile("git", search.path);
  if (found === undefined || canonical(found) !== XCODE_STAND_IN) {
    return found;
  }
  return (await search.hasDeveloperTools()) ? found : undefined;
}

function firstFile(name: string, searchPath: string): string | undefined {
  for (const folder of searchPath.split(path.delimiter)) {
    const candidate = path.join(folder, name);
    try {
      if (folder && statSync(candidate).isFile()) {
        return candidate;
      }
    } catch {
      // Not in this folder.
    }
  }
  return undefined;
}

function canonical(file: string): string {
  try {
    return realpathSync(file);
  } catch {
    return file;
  }
}

function systemSearch(): GitSearch {
  return {
    platform: process.platform,
    path: process.env.PATH ?? "",
    hasDeveloperTools: () =>
      new Promise((resolve) => {
        execFile("/usr/bin/xcode-select", ["-p"], { timeout: 5000 }, (error) =>
          resolve(!error),
        );
      }),
  };
}
