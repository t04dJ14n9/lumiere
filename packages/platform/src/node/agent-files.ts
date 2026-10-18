import { renameSync } from "node:fs";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import path from "node:path";
import type { TempFs } from "@workshop/agents/ide-context";
import type { AgentFiles } from "../services";
import { pathToFileUriString } from "./file-uri";

const tempFs: TempFs = {
  mkdir: async (file, options) => {
    await fs.mkdir(file, { recursive: true, mode: options?.mode });
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

/** Agent files in the system temp folder, read again at each use as before. */
export const nodeAgentFiles: AgentFiles = {
  async writeScratchFile(folder, name, text) {
    const directory = path.join(os.tmpdir(), folder);
    await fs.mkdir(directory, { recursive: true, mode: 0o700 });
    const file = path.join(directory, path.basename(name));
    await fs.writeFile(file, text, { mode: 0o600 });
    return file;
  },
  ideContext: {
    fs: tempFs,
    get dir() {
      return path.join(os.tmpdir(), "agent-ide-context");
    },
    fileUri: pathToFileUriString,
  },
};
