import { afterLayout } from "./layout";
import { observeNavigation, runNavigation } from "./navigation";
import { editorSettings } from "./settings";
import { bindCaller, type CallerBound, type Context } from "@workshop/core";
import type { EditorService } from "./api";
import type { Endpoint } from "../../shared/rpc/endpoint";
import type { ExtensionRegistry } from "./extensions";
import type { ViewContributions } from "./contributions";
import { createClipboard } from "./clipboard";
import { caretFactory } from "./caret-view";

/** Bind extension ownership to the consumer while preserving one shared editor. */
export function createEditorService(options: {
  view: EditorService["view"];
  registry: ExtensionRegistry;
  contributions: ViewContributions;
  source: string;
  mode: EditorService["mode"];
  rpc: Endpoint;
  onModeChanged(mode: EditorService["mode"]): void;
}): EditorService & CallerBound<EditorService> {
  const { view, registry, contributions, source, rpc } = options;
  let mode = options.mode;
  const editor: EditorService & CallerBound<EditorService> = {
    [bindCaller](caller) {
      return bindEditorExtensions(editor, registry, caller);
    },
    view,
    caret: caretFactory(() => view.state.facet(editorSettings)),
    get settings() {
      return view.state.facet(editorSettings);
    },
    clipboard: createClipboard(rpc),
    source: source,
    viewState: contributions,
    get mode() {
      return mode;
    },
    set mode(value) {
      mode = value;
      options.onModeChanged(value);
    },
    settled: () => afterLayout(view),
    navigate: (jump) => runNavigation(view, jump),
    onNavigate: (capture) => observeNavigation(view, capture),
    focus() {
      view.focus();
    },
    extend(extension, options) {
      return registry.register(
        options?.owner ?? "editor",
        extension,
        options?.slot,
      );
    },
  };
  return editor;
}

function bindEditorExtensions(
  editor: EditorService,
  registry: ExtensionRegistry,
  caller: Context,
): EditorService {
  return new Proxy(editor, {
    get(target, key, receiver) {
      if (key === "extend") {
        return (
          extension: Parameters<EditorService["extend"]>[0],
          options?: Parameters<EditorService["extend"]>[1],
        ) =>
          registry.register(
            options?.owner ?? caller.owner,
            extension,
            options?.slot,
          );
      }
      return Reflect.get(target, key, receiver);
    },
  });
}
