import {
  type EditorState,
  StateEffect,
  StateField,
  type Extension,
} from "@codemirror/state";
import { Decoration, type DecorationSet, EditorView } from "@codemirror/view";
import { foldedRanges, unfoldEffect } from "@codemirror/language";
import { noteFragment } from "../../markdown/metadata/fragments";
import { parseNativeLineFragment } from "../../shared/native-links";

/** Transient target-flash range matching Obsidian's 2 s `.is-flashing` highlight. */
export const FLASH_DURATION_MS = 2000;

export interface FlashRange {
  readonly from: number;
  readonly to: number;
}

export const setFlashing = StateEffect.define<FlashRange | null>();

const flashingMark = Decoration.mark({ class: "is-flashing" });

const flashingField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(decorations, tr) {
    let next = decorations.map(tr.changes);
    for (const effect of tr.effects) {
      if (!effect.is(setFlashing)) {
        continue;
      }
      if (!effect.value) {
        next = Decoration.none;
        continue;
      }
      const docLength = tr.state.doc.length;
      const from = Math.max(0, Math.min(effect.value.from, docLength));
      const to = Math.max(from, Math.min(effect.value.to, docLength));
      next =
        to > from
          ? Decoration.set([flashingMark.range(from, to)])
          : Decoration.none;
    }
    return next;
  },
  provide: (field) => EditorView.decorations.from(field),
});

export function flashingHighlights(): Extension {
  return flashingField;
}

/**
 * Unfold effects for any folded range covering `[from, to]`, so navigating into
 * a collapsed heading or section reveals the target before scrolling.
 */
export function unfoldTargetEffects(
  state: EditorState,
  from: number,
  to: number,
): StateEffect<{ from: number; to: number }>[] {
  const effects: StateEffect<{ from: number; to: number }>[] = [];
  const checkTo = Math.max(from + 1, to);
  foldedRanges(state).between(0, state.doc.length, (foldFrom, foldTo) => {
    if (foldFrom <= checkTo && foldTo >= from) {
      effects.push(unfoldEffect.of({ from: foldFrom, to: foldTo }));
    }
  });
  return effects;
}

/**
 * Resolve a navigation target to its cursor anchor and highlight range.
 * When `to` is provided with `at` (e.g. a search result match), `selectTo`
 * selects the matched span `[from, to]` and flashes the exact match; otherwise
 * the cursor lands at `from` and the target line/heading/block is flashed.
 */
export function resolveNavigationTarget(
  state: EditorState,
  fragment: string,
  at?: number,
  to?: number,
): { from: number; to: number; selectTo?: number } | undefined {
  const { doc } = state;
  if (at !== undefined) {
    const from = Math.min(at, doc.length);
    if (to !== undefined && to > at) {
      const end = Math.min(to, doc.length);
      return {
        from,
        to: end,
        ...(end > from ? { selectTo: end } : {}),
      };
    }
    return { from, to: doc.lineAt(from).to };
  }
  // Cursor / VS Code `#L19` / `#L19-L21` (and open-native-line) are line
  // ranges, not heading or block ids — same full-line selection shape.
  const lines = parseNativeLineFragment(fragment);
  if (lines) {
    if (lines.endLine > doc.lines) {
      return undefined;
    }
    const from = doc.line(lines.startLine).from;
    const end = doc.line(lines.endLine).to;
    return {
      from,
      to: end,
      ...(end > from ? { selectTo: end } : {}),
    };
  }
  const match = noteFragment(doc.toString(), fragment);
  if (!match) {
    return undefined;
  }
  const from = Math.min(match.from, doc.length);
  const line = doc.lineAt(from);
  if (fragment.startsWith("^")) {
    return {
      from,
      to: Math.max(from, Math.min(match.to, doc.length)),
    };
  }
  return { from, to: line.to };
}

/**
 * Auto-clears the `.is-flashing` decoration after `durationMs` or on the next
 * pointer/key interaction inside the editor.
 */
export function bindFlashingLifecycle(
  view: EditorView,
  durationMs = FLASH_DURATION_MS,
): { readonly extension: Extension; dispose(): void } {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const clearTimer = () => {
    if (timer !== undefined) {
      clearTimeout(timer);
      timer = undefined;
    }
  };
  const clear = () => {
    clearTimer();
    if (view.state.field(flashingField, false)?.size) {
      view.dispatch({ effects: setFlashing.of(null) });
    }
  };
  const listener = EditorView.updateListener.of((update) => {
    for (const tr of update.transactions) {
      for (const effect of tr.effects) {
        if (!effect.is(setFlashing)) {
          continue;
        }
        clearTimer();
        if (effect.value && durationMs > 0) {
          timer = setTimeout(clear, durationMs);
        }
      }
    }
  });
  const onPointerDown = () => clear();
  const onKeyDown = () => clear();
  view.dom.addEventListener("pointerdown", onPointerDown, { passive: true });
  view.dom.addEventListener("keydown", onKeyDown, { passive: true });
  return {
    extension: listener,
    dispose() {
      clearTimer();
      view.dom.removeEventListener("pointerdown", onPointerDown);
      view.dom.removeEventListener("keydown", onKeyDown);
    },
  };
}
