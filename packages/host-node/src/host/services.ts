/**
 * Every host service the Markdown plugins inject, for a host outside VS Code,
 * over its platform (platform.ts). The VS Code adapter is
 * packages/markdown/src/host/services; this is its twin.
 */
import type {
  AgentHost,
  ContributedSetting,
  GitAccess,
  HostCommands,
  HostServices,
} from "@workshop/markdown/portable";
import type { NoteDocuments } from "./documents";
import { noDiffViews, noGit, noViews } from "./inert";
import { createHostNavigation } from "./navigation";
import type { PanelHub } from "./panels";
import type { ContextKeys } from "./context-menu";
import type { HostPlatform } from "./platform";
import { createHostSettings } from "./settings";
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

export interface HostServicesOptions {
  readonly platform: HostPlatform;
  readonly identity: HostIdentity;
  readonly documents: NoteDocuments;
  readonly panels: PanelHub;
  readonly roots: () => readonly string[];
  readonly contributed: readonly ContributedSetting[];
  /** What the store held at start: the reader's settings and the workspace state. */
  readonly saved: {
    readonly settings: string | undefined;
    readonly state: string | undefined;
  };
  readonly log: (message: string) => void;
  /** The plugins' commands (createHostCommands); tree nodes run them too. */
  readonly commands: HostCommands;
  /** The plugins' tree views, which the embedder shows (trees.ts). */
  readonly trees: TreeHub;
  /** Blame and the change gutter, from the `git` command line (git.ts). */
  readonly git?: GitAccess;
}

export function createHostServices(options: HostServicesOptions): HostServices {
  const { platform, documents, panels, roots, log } = options;
  const { files, store } = platform;
  const settings = createHostSettings({
    contributed: options.contributed,
    store,
    saved: options.saved.settings,
  });
  return {
    hostDocuments: documents,
    hostCommands: options.commands,
    clipboard: createClipboard(panels),
    dialogs: createDialogs(panels, log),
    views: nodeViews(options.trees, noViews),
    activeEditor: createActiveEditor(panels),
    settings,
    workspace: createHostWorkspace({
      files,
      roots,
    }),
    storage: createWorkspaceStorage(store, options.saved.state),
    extensions: createExtensions(platform.workers),
    navigation: createHostNavigation(files, panels, settings, options.identity),
    customEditors: panels,
    agentHost: createAgentHost(options.identity, platform),
    git: options.git ?? noGit,
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
function createAgentHost(
  identity: HostIdentity,
  platform: Pick<HostPlatform, "writeScratchFile">,
): AgentHost {
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
    writeScratchFile: (name, text) => platform.writeScratchFile(name, text),
  };
}
