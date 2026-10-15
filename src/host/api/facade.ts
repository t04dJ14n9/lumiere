import { publicApiHost } from "../../plugins/publicApi/host";
import type { Context } from "../../kernel";
import type {} from "../../plugins/codeBlocks/api";
import type { ApiPlatform } from "./platform";
import type {
  MarkdownWorkshopApi,
  EditorSnapshot,
  DocumentState,
  PluginState,
} from "./types";
import type { Uri } from "vscode";
import type { HostDocument } from "../../shared/runtime";
import { editorOperations } from "./editors";
import { vaultOperations } from "./vault";
import { pluginOperations } from "./plugins";
import { registerPluginManagement } from "./management";
import { registerOpenReference } from "./open-reference";
import { ExternalPlugins } from "./external-manager";
import { ApiEvent } from "./event";
import { documentSnapshot, editorSnapshot } from "./snapshots";
function buildApi(root: Context, platform: ApiPlatform): MarkdownWorkshopApi {
  const events = createEvents(root);
  const changed = () => {
    for (const panel of root.editors.all()) {
      events.plugins.fire(
        Object.freeze({ editorId: panel.id, states: api.getPlugins(panel.id) }),
      );
    }
  };
  const external = new ExternalPlugins({
    root,
    platform,
    api: () => api,
    changed,
  });
  const api: MarkdownWorkshopApi = Object.freeze({
    apiVersion: 1 as const,
    ...editorOperations(root, platform),
    ...vaultOperations(root, platform),
    ...pluginOperations(root, platform, external),
    onDidOpenEditor: events.open.event,
    onDidCloseEditor: events.close.event,
    onDidChangeActiveEditor: events.active.event,
    onDidChangeDocument: events.document.event,
    onDidChangeSelection: events.selection.event,
    onDidChangePlugins: events.plugins.event,
    onDidResolveLinks: events.resolved.event,
  });
  bindEvents(root, platform, events, changed);
  registerPluginManagement(root, api, platform);
  registerOpenReference(root, api, platform);
  return api;
}
function createEvents(root: Context) {
  const failed = (error: unknown) =>
    root.logger.error("API event listener failed", error);
  const events = {
    open: new ApiEvent<EditorSnapshot>(failed),
    close: new ApiEvent<{ readonly editorId: string }>(failed),
    active: new ApiEvent<EditorSnapshot | undefined>(failed),
    document: new ApiEvent<DocumentState>(failed),
    selection: new ApiEvent<{
      readonly editorId: string;
      readonly hasSelection: boolean;
    }>(failed),
    plugins: new ApiEvent<{
      readonly editorId: string;
      readonly states: readonly PluginState[];
    }>(failed),
    resolved: new ApiEvent<{ readonly vault: Uri }>(failed),
  };
  root.effect(() => () => {
    for (const event of Object.values(events)) {
      event.dispose();
    }
  });
  return events;
}
function bindEvents(
  root: Context,
  platform: ApiPlatform,
  events: ReturnType<typeof createEvents>,
  changed: () => void,
): void {
  root.on("editor/opened", (panel) =>
    events.open.fire(editorSnapshot(panel, platform)),
  );
  root.on("editor/closed", (panel) =>
    events.close.fire(Object.freeze({ editorId: panel.id })),
  );
  root.on("editor/activeChanged", (panel) =>
    events.active.fire(panel && editorSnapshot(panel, platform)),
  );
  root.on("editor/selectionChanged", (panel, hasSelection) =>
    events.selection.fire(Object.freeze({ editorId: panel.id, hasSelection })),
  );
  root.on("editor/pluginsChanged", changed);
  root.on("editor/ready", changed);
  root.on("vault/resolved", (vault) =>
    events.resolved.fire(Object.freeze({ vault: platform.uri(vault) })),
  );
  // The workshop reports every text document; the API reports notes open
  // in this editor.
  const fireDocument = (document: HostDocument) => {
    if (root.editors.all().some((panel) => panel.document.id === document.id)) {
      events.document.fire(documentSnapshot(document, platform));
    }
  };
  root.effect(() => root.workshop.onChange(fireDocument));
  root.effect(() => root.workshop.onSave(fireDocument));
}

export async function createApi(
  root: Context,
  platform: ApiPlatform,
): Promise<MarkdownWorkshopApi> {
  let api: MarkdownWorkshopApi | undefined;
  const fiber = root.plugin(publicApiHost, {
    create(ctx) {
      api = buildApi(ctx, platform);
    },
  });
  await root.settled();
  if (!api) {
    throw fiber.error ?? new Error("Public API dependencies are unavailable");
  }
  return api;
}
