/**
 * Every host service the Markdown plugins inject, for a Node host. The
 * VS Code adapter is packages/markdown/src/host/services; this is its twin.
 */
import { mkdir, writeFile } from "node:fs/promises";
import * as path from "node:path";
import { pathToFileURL } from "node:url";
import type {
  AgentHost,
  ContributedSetting,
  GitAccess,
  HostCommands,
  HostServices,
} from "@workshop/markdown/portable";
import type { NoteDocuments } from "./documents";
import { noDiffViews, noViews } from "./inert";
import { createNodeNavigation } from "./navigation";
import type { PanelHub } from "./panels";
import type { ContextKeys } from "./context-menu";
import { createNodeSettings } from "./settings";
import { nodeViews, type TreeHub } from "./trees";
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

/** Which app Lumière runs in, as VS Code's `env.appName` and `env.uriScheme` name it. */
export interface HostIdentity {
  /** "DeepSeek Harness", "Lumière". */
  readonly appName: string;
  /** The app's link scheme: "dsh", "lumiere". */
  readonly uriScheme: string;
}

export interface NodeServicesOptions {
  readonly identity: HostIdentity;
  readonly documents: NoteDocuments;
  readonly panels: PanelHub;
  readonly roots: () => readonly string[];
  readonly contributed: readonly ContributedSetting[];
  /** The built editor (`packages/markdown/dist`). */
  readonly markdownDist: string;
  /** Where settings, state and vault snapshots are kept. */
  readonly data: string;
  readonly log: (message: string) => void;
  /** The plugins' commands (createHostCommands); tree nodes run them too. */
  readonly commands: HostCommands;
  /** The plugins' tree views, which the embedder shows (trees.ts). */
  readonly trees: TreeHub;
  /** Blame and the change gutter, from the `git` command line (git.ts). */
  readonly git: GitAccess;
}

export function createNodeHostServices(
  options: NodeServicesOptions,
): HostServices {
  const { documents, panels, roots, data, log } = options;
  const settings = createNodeSettings({
    contributed: options.contributed,
    file: path.join(data, "settings.json"),
  });
  return {
    hostDocuments: documents,
    hostCommands: options.commands,
    clipboard: createClipboard(panels),
    dialogs: createDialogs(panels, log),
    views: nodeViews(options.trees, noViews),
    activeEditor: createActiveEditor(panels),
    settings,
    workspace: createHostWorkspace(roots),
    storage: createWorkspaceStorage(path.join(data, "state.json")),
    extensions: createExtensions(options.markdownDist),
    navigation: createNodeNavigation(panels, settings, options.identity),
    customEditors: panels,
    agentHost: createAgentHost(options.identity, data),
    git: options.git,
    diffViews: noDiffViews,
  };
}

/**
 * Commands the plugins register run here. VS Code's own commands
 * (`setContext`, `workbench.*`) have no meaning here and do nothing.
 */
export interface NodeHostCommands extends HostCommands {
  has(id: string): boolean;
}

export function createHostCommands(
  log: (message: string) => void,
  keys: ContextKeys,
): NodeHostCommands {
  const commands = new Map<string, (...args: unknown[]) => unknown>();
  return {
    has(id) {
      return commands.has(id);
    },
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
      // The right-click menu reads these, as VS Code's menus do (context-menu.ts).
      if (id === "setContext" && typeof args[0] === "string") {
        keys.set(args[0], args[1]);
        return undefined;
      }
      if (!isVsCodeOnly(id)) {
        log(`No command ${id} outside VS Code`);
      }
      return undefined;
    },
  };
}

/**
 * VS Code's own commands: context keys, the workbench, and the commands it
 * makes for every view (`<view>.focus`, `outline.removeView`). The embedder
 * decides what is on screen, so these have nothing to do here.
 */
function isVsCodeOnly(id: string): boolean {
  return (
    id.startsWith("setContext") ||
    id.startsWith("workbench.") ||
    /\.(focus|removeView|resetViewLocation)$/.test(id)
  );
}

/**
 * Copy Link for Agent copies to the clipboard: no agent extension runs here.
 * In DSH the agent's chat is beside the note, so pasting is one step.
 */
function createAgentHost(identity: HostIdentity, data: string): AgentHost {
  return {
    appName: identity.appName,
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
