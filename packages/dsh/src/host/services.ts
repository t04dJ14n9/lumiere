/**
 * Every host service the Markdown plugins inject, as DSH provides them. The
 * VS Code adapter is packages/markdown/src/host/services; this is its twin.
 */
import { mkdir, writeFile } from "node:fs/promises";
import * as path from "node:path";
import { pathToFileURL } from "node:url";
import type {
  AgentHost,
  ContributedSetting,
  HostCommands,
  HostServices,
} from "@workshop/markdown/portable";
import type { NoteDocuments } from "./documents";
import { noDiffViews, noGit, noViews } from "./inert";
import { createDshNavigation } from "./navigation";
import type { PanelHub } from "./panels";
import { createDshSettings } from "./settings";
import {
  createActiveEditor,
  createClipboard,
  createDialogs,
} from "./ui-services";
import {
  createExtensions,
  createHostWorkspace,
  createWorkspaceStorage,
} from "./workspace";

export interface DshServicesOptions {
  readonly documents: NoteDocuments;
  readonly panels: PanelHub;
  readonly roots: () => readonly string[];
  readonly contributed: readonly ContributedSetting[];
  /** The bundle's copy of the extension's `dist/markdown`. */
  readonly markdownDist: string;
  /** The plugin's own data folder. */
  readonly data: string;
  readonly log: (message: string) => void;
}

export function createDshHostServices(
  options: DshServicesOptions,
): HostServices {
  const { documents, panels, roots, data, log } = options;
  const settings = createDshSettings({
    contributed: options.contributed,
    file: path.join(data, "settings.json"),
  });
  return {
    hostDocuments: documents,
    hostCommands: createHostCommands(log),
    clipboard: createClipboard(panels),
    dialogs: createDialogs(panels, log),
    views: noViews,
    activeEditor: createActiveEditor(panels),
    settings,
    workspace: createHostWorkspace(roots),
    storage: createWorkspaceStorage(path.join(data, "state.json")),
    extensions: createExtensions(options.markdownDist),
    navigation: createDshNavigation(panels, settings),
    customEditors: panels,
    agentHost: createAgentHost(data),
    git: noGit,
    diffViews: noDiffViews,
  };
}

/**
 * Commands the plugins register run here. VS Code's own commands
 * (`setContext`, `workbench.*`) have no meaning in DSH and do nothing.
 */
export function createHostCommands(
  log: (message: string) => void,
): HostCommands {
  const commands = new Map<string, (...args: unknown[]) => unknown>();
  return {
    register(id, run) {
      commands.set(id, run);
      return () => {
        if (commands.get(id) === run) {
          commands.delete(id);
        }
      };
    },
    async execute(id, ...args) {
      const run = commands.get(id);
      if (run) {
        return run(...args);
      }
      if (!id.startsWith("setContext") && !id.startsWith("workbench.")) {
        log(`No command ${id} in DeepSeek Harness`);
      }
      return undefined;
    },
  };
}

/** Copy Link for Agent copies; DSH's chat is next to the note, so pasting is one step. */
function createAgentHost(data: string): AgentHost {
  return {
    appName: "DeepSeek Harness",
    async environment() {
      return {
        target: "clipboard",
        agentExtensions: new Set(),
        commands: new Set(),
        hasChatParticipant: false,
        chatDisabled: true,
      };
    },
    async writeScratchFile(name, text) {
      const folder = path.join(data, "agent");
      await mkdir(folder, { recursive: true, mode: 0o700 });
      const file = path.join(folder, path.basename(name));
      await writeFile(file, text, { mode: 0o600 });
      return pathToFileURL(file).toString();
    },
  };
}
