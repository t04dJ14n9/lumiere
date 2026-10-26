/**
 * The temp folder agents read IDE context packets from (Codex attaches the
 * file), on VS Code's local disk: the agent host's `ideContextTemp`.
 */
import * as fs from "node:fs/promises";
import { renameSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { TempFs } from "@workshop/agents/ide-context";
import type { IdeContextTemp } from "../shared/host";
import { pathToFileUriString } from "./ide-context-file-uri";

const nodeTempFs: TempFs = {
  mkdir: async (folder, options) => {
    await fs.mkdir(folder, { recursive: true, mode: options?.mode });
  },
  writeFile: (file, data, options) =>
    fs.writeFile(file, data, { mode: options?.mode }),
  rename: (from, to) => fs.rename(from, to),
  readFile: (file) => fs.readFile(file),
  unlink: (file) => fs.unlink(file),
  listNames: (folder) => fs.readdir(folder),
  stat: async (file) => {
    const info = await fs.stat(file);
    return {
      mtimeMs: info.mtimeMs,
      size: info.size,
      isFile: () => info.isFile(),
      isDirectory: () => info.isDirectory(),
    };
  },
  renameSync: (from, to) => renameSync(from, to),
};

export const ideContextTemp: IdeContextTemp = {
  fs: nodeTempFs,
  // Read at each use, as before: the system temp folder can change.
  get dir() {
    return path.join(os.tmpdir(), "agent-ide-context");
  },
  fileUri: pathToFileUriString,
};
