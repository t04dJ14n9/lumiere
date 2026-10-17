import { EditorView } from "@codemirror/view";
import type { Context, Infer, Logger } from "@workshop/core";
import type { ViewContributions } from "./contributions";
import type { EditorService } from "./api";
import { protocol, viewState } from "./protocol";
import type { createViewState } from "./view-state";

type SavedView = Infer<typeof viewState>;
type Presentation = ReturnType<typeof createViewState>;
interface PersistenceConfig {
  saved?: unknown;
  persist?: (state: SavedView) => void;
}

/** Capture remains cheap during typing; geometric anchoring runs only on transfer. */
export function registerViewPersistence(
  ctx: Context,
  editor: EditorService,
  stateServices: {
    presentation: Presentation;
    contributions: ViewContributions;
  },
  config: PersistenceConfig,
): void {
  const { presentation, contributions } = stateServices;
  const state = new EditorPersistence(
    editor,
    presentation,
    contributions,
    (mode) => ctx.emit("editor/modeRestored", mode),
  );
  const view = editor.view;
  const checkpoint = geometricPersistence(ctx, editor, presentation, {
    state,
    config,
  });
  ctx.effect(() =>
    ctx.rpc.handle(protocol, "captureView", async () => {
      await ctx.document.flush();
      return presentation.captureViewState(view, state.capture());
    }),
  );
  ctx.effect(() =>
    ctx.rpc.handle(protocol, "restoreView", (saved) => {
      state.restore(saved);
      return true;
    }),
  );
  ctx.effect(() =>
    editor.extend(
      EditorView.updateListener.of((update) => {
        if (
          update.selectionSet ||
          update.docChanged ||
          update.transactions.some(
            (transaction) => transaction.effects.length > 0,
          )
        ) {
          config.persist?.(state.capture());
          checkpoint();
        }
      }),
    ),
  );
  ctx.effect(() => {
    const save = () => {
      config.persist?.(state.capture());
      checkpoint();
    };
    view.scrollDOM.addEventListener("scroll", save);
    return () => view.scrollDOM.removeEventListener("scroll", save);
  });
  restoreInitialView(state, editor.source, config.saved, ctx.logger);
}

function geometricPersistence(
  ctx: Context,
  editor: EditorService,
  presentation: Presentation,
  persistence: { state: EditorPersistence; config: PersistenceConfig },
): () => void {
  const { state, config } = persistence;
  const view = editor.view;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const save = () =>
    config.persist?.(presentation.captureViewState(view, state.capture()));
  ctx.effect(() => {
    const window = view.dom.ownerDocument.defaultView;
    window?.addEventListener("pagehide", save);
    return () => {
      clearTimeout(timer);
      window?.removeEventListener("pagehide", save);
    };
  });
  return () => {
    clearTimeout(timer);
    timer = setTimeout(save, 150);
  };
}

class EditorPersistence {
  constructor(
    private readonly editor: EditorService,
    private readonly presentation: Presentation,
    private readonly contributions: ViewContributions,
    private readonly modeRestored: (mode: EditorService["mode"]) => void,
  ) {}

  capture(): SavedView {
    const { view } = this.editor;
    return {
      source: this.editor.source,
      anchor: view.state.selection.main.anchor,
      head: view.state.selection.main.head,
      scrollTop: view.scrollDOM.scrollTop,
      scrollLeft: view.scrollDOM.scrollLeft,
      folded: [],
      folds: {},
      contributions: this.contributions.capture(),
      mode: this.editor.mode,
    };
  }

  restore(state: SavedView): void {
    this.editor.mode = state.mode;
    // Legacy top-level keys remain readable by their owning contributors.
    this.contributions.restore(state.contributions, state.source, {
      folded: state.folded,
      folds: state.folds,
    });
    this.presentation.restoreViewState(this.editor.view, state);
    this.modeRestored(state.mode);
  }
}

function restoreInitialView(
  state: EditorPersistence,
  source: string,
  value: unknown,
  logger: Logger,
): void {
  if (!value) {
    return;
  }
  try {
    const saved = viewState.parse(value);
    if (saved.source === source) {
      state.restore(saved);
    }
  } catch (error) {
    logger.warn("Ignored invalid saved view state", error);
  }
}
