/**
 * The window's backend in the web and iPad apps (shell/backend.ts): host-web
 * in the same window answers what a Lumière server answers over HTTP.
 */
import {
  createSettingsService,
  type LumiereHost,
} from "@workshop/host-node/core";
import {
  openEditorPage,
  openPdfPage,
  type EditorPageUrls,
  type Mounts,
} from "@workshop/host-web";
import {
  pluginTitles,
  settingsUnavailableIn,
} from "@workshop/markdown/portable";
import type { ServerEvent } from "../shell/api";
import type { OpenedEditor, WindowBackend } from "../shell/backend";
import { fileKind } from "../shared/file-kind";
import { parseUiChange, readUiState, type UiState } from "../shared/ui-state";
import type { TextFile, VaultTrust } from "../shared/vault-trust";
import type { LocalVaults } from "./vaults";

/** What a host without Node offers the plugins: no Git, no extra panels. */
export const WEB_HOST_OFFERS = [] as const;

export interface LocalBackendParts {
  readonly host: LumiereHost;
  readonly files: Mounts;
  readonly vaults: LocalVaults;
  readonly trust: VaultTrust;
  /** The window's layout and theme. */
  readonly layout: TextFile;
  readonly events: EventHub;
  readonly pages: EditorPageUrls;
  readonly pickFolder?: () => Promise<string | undefined>;
}

export function createLocalBackend(parts: LocalBackendParts): WindowBackend {
  const { host, files, vaults, trust, pages } = parts;
  return {
    vaults: {
      list: async () => vaults.list(),
      add: (path) => vaults.add(path),
      files: (vault) => vaults.files(vault),
      open: (path) => vaults.show(path),
    },
    trust: {
      questions: async () => trust.questions(),
      decide: (vault, allowed) => trust.decide(vault, allowed),
    },
    events: (listener) => parts.events.listen(listener),
    ui: layoutIn(parts.layout),
    settings: settingsOf(host),
    views: {
      snapshot: (viewId) => host.trees.snapshot(viewId),
      run: async (viewId, id) => {
        await host.trees.run(viewId, id);
      },
      setVisible: async (viewId, visible) =>
        host.trees.setVisible(viewId, visible),
      events: (listener) => host.trees.onEvent(listener),
    },
    editors: {
      kinds: ["note", "pdf"],
      open: (vault, path) => {
        const uri = files.uriOf(`${vault}/${path}`);
        return fileKind(path) === "pdf"
          ? openPdf(files, uri, pages)
          : openEditorPage(host, { uri, root: files.uriOf(vault) }, pages);
      },
    },
    ...(parts.pickFolder ? { pickFolder: parts.pickFolder } : {}),
  };
}

/** A PDF in a tab: Lumière's PDF viewer, in a page of its own. */
async function openPdf(
  files: Mounts,
  uri: string,
  pages: EditorPageUrls,
): Promise<OpenedEditor> {
  return openPdfPage(await files.readBytes(uri), pages);
}

/** The window's layout and theme, kept in `file`. */
function layoutIn(file: TextFile): WindowBackend["ui"] {
  let layout: UiState | undefined;
  const load = async () => {
    layout ??= readUiState(parse(await file.read()));
    return layout;
  };
  return {
    load,
    async save(change) {
      layout = { ...(await load()), ...parseUiChange(change) };
      await file.write(JSON.stringify(layout, null, 2));
      return layout;
    },
  };
}

/** Lumière's settings, as host-node's settings page lists and changes them. */
function settingsOf(host: LumiereHost): WindowBackend["settings"] {
  const settings = createSettingsService(
    host.settings,
    pluginTitles(),
    settingsUnavailableIn([...WEB_HOST_OFFERS]),
  );
  return {
    list: async () => settings.list(),
    async change(change) {
      const result = await settings.change({ ...change });
      if ("problem" in result) {
        throw new Error(result.problem);
      }
      return result.item;
    },
  };
}

/** The window's events: vaults opened, notes to open, trust questions. */
export class EventHub {
  private readonly listeners = new Set<(event: ServerEvent) => void>();

  listen(listener: (event: ServerEvent) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  emit(event: ServerEvent): void {
    for (const listener of this.listeners) {
      listener(event);
    }
  }
}

function parse(text: string | undefined): unknown {
  try {
    return JSON.parse(text ?? "{}");
  } catch {
    return {};
  }
}
