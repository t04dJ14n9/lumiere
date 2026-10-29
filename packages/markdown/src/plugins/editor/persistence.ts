import { syntaxTree } from "@codemirror/language";
import type { Transaction } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import type { Context, Infer, Logger } from "@workshop/core";
import type { ViewContributions } from "./contributions";
import { backgroundUpdate, type EditorService } from "./api";
import { protocol, viewState } from "./protocol";
import type { createViewState } from "./view-state";

type SavedView = Infer<typeof viewState>;
type Presentation = ReturnType<typeof createViewState>;

/**
 * Whether an update carries effects the view state may hold (folds, say).
 * Background work does not: CodeMirror's own parse changes the syntax
 * tree, and other plugins mark theirs with `backgroundUpdate`.
 */
export const hasPersistedEffects = (update: {
  startState: EditorView["state"];
  state: EditorView["state"];
  transactions: readonly Pick<Transaction, "effects" | "annotation">[];
}): boolean =>
  syntaxTree(update.startState) === syntaxTree(update.state) &&
  update.transactions.some(
    (tx) => tx.effects.length > 0 && !tx.annotation(backgroundUpdate),
  );

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
        if (update.selectionSet || update.docChanged) {
          config.persist?.(state.capture());
          checkpoint();
          return;
        }
        if (hasPersistedEffects(update)) {
          checkpoint();
        }
      }),
    ),
  );
  ctx.effect(() => {
    view.scrollDOM.addEventListener("scroll", checkpoint, { passive: true });
    return () => view.scrollDOM.removeEventListener("scroll", checkpoint);
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
  let pending = false;
  const save = () => {
    clearTimeout(timer);
    timer = undefined;
    pending = false;
    config.persist?.(presentation.captureViewState(view, state.capture()));
  };
  ctx.effect(() => {
    const window = view.dom.ownerDocument.defaultView;
    window?.addEventListener("pagehide", save);
    return () => {
      window?.removeEventListener("pagehide", save);
      if (pending) {
        save();
      } else {
        clearTimeout(timer);
        timer = undefined;
      }
    };
  });
  return () => {
    pending = true;
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
