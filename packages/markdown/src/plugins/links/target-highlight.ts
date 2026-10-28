import { foldedRanges, unfoldEffect } from "@codemirror/language";
import { StateEffect, StateField, type EditorState } from "@codemirror/state";
import { Decoration, EditorView, type DecorationSet } from "@codemirror/view";
import type { Context } from "@workshop/core";
import { noteFragment } from "../../markdown/metadata/fragments";

export const setFlashing = StateEffect.define<{
  from: number;
  to: number;
} | null>();
const flashingMark = Decoration.mark({ class: "is-flashing" });

export const flashingHighlights = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(decorations, transaction) {
    decorations = decorations.map(transaction.changes);
    for (const effect of transaction.effects) {
      if (effect.is(setFlashing)) {
        if (!effect.value || effect.value.from >= effect.value.to) {
          decorations = Decoration.none;
        } else {
          decorations = Decoration.set([
            flashingMark.range(effect.value.from, effect.value.to),
          ]);
        }
      }
    }
    return decorations;
  },
  provide: (field) => EditorView.decorations.from(field),
});

export function unfoldTargetEffects(
  state: EditorState,
  from: number,
  to: number,
): StateEffect<{ from: number; to: number }>[] {
  const effects: StateEffect<{ from: number; to: number }>[] = [];
  foldedRanges(state).between(from, to, (foldFrom, foldTo) => {
    if (to !== foldFrom && from !== foldTo) {
      effects.push(unfoldEffect.of({ from: foldFrom, to: foldTo }));
    }
  });
  return effects;
}

export function resolveNavigationTarget(
  state: EditorState,
  fragment: string,
  at?: number,
): { from: number; to: number } | undefined {
  const doc = state.doc;
  if (at !== undefined) {
    const clamped = Math.min(at, doc.length);
    return { from: clamped, to: doc.lineAt(clamped).to };
  }
  const resolved = noteFragment(doc.toString(), fragment);
  if (!resolved) {
    return undefined;
  }
  let end = resolved.to;
  while (end > resolved.from && doc.sliceString(end - 1, end) === "\n") {
    end--;
  }
  return { from: resolved.from, to: end };
}

export function bindFlashingLifecycle(ctx: Context): {
  flash(target: { from: number; to: number }, active: boolean): void;
} {
  const view = ctx.editor.view;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const clear = () => {
    if (timer !== undefined) {
      clearTimeout(timer);
      timer = undefined;
    }
    if (
      view.dom.isConnected &&
      (view.state.field(flashingHighlights, false)?.size ?? 0) > 0
    ) {
      view.dispatch({ effects: setFlashing.of(null) });
    }
  };
  ctx.effect(() => {
    const onPointerDown = () => {
      if ((view.state.field(flashingHighlights, false)?.size ?? 0) > 0) {
        setTimeout(clear, 0);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        clear();
      }
    };
    view.dom.addEventListener("pointerdown", onPointerDown);
    view.dom.addEventListener("keydown", onKeyDown);
    return () => {
      if (timer !== undefined) {
        clearTimeout(timer);
      }
      view.dom.removeEventListener("pointerdown", onPointerDown);
      view.dom.removeEventListener("keydown", onKeyDown);
    };
  });
  return {
    flash(_target, active) {
      if (timer !== undefined) {
        clearTimeout(timer);
      }
      if (active) {
        timer = setTimeout(clear, 3000);
      }
    },
  };
}
