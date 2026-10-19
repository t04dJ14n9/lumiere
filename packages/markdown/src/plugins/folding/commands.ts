import {
  foldEffect,
  foldable,
  foldedRanges,
  unfoldEffect,
} from "@codemirror/language";
import type { EditorState, Line, StateEffect } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";

/**
 * Obsidian's fold commands, measured against Obsidian. A section is what a
 * line folds: a heading's, a list item's children, or an indented block. It
 * starts on its line and is folded from that line's end.
 */

interface Section {
  from: number;
  to: number;
}

/** The folded section starting on `line`, if there is one. */
function foldedOn(state: EditorState, line: Line): Section | undefined {
  let found: Section | undefined;
  foldedRanges(state).between(line.from, line.to, (from, to) => {
    if (from >= line.from && from <= line.to && (!found || from < found.from)) {
      found = { from, to };
    }
  });
  return found;
}

/** The lines the selection touches, each once. */
function selectedLines(state: EditorState): Line[] {
  const lines = new Map<number, Line>();
  for (const range of state.selection.ranges) {
    const last = state.doc.lineAt(range.to).number;
    for (let n = state.doc.lineAt(range.from).number; n <= last; n++) {
      lines.set(n, state.doc.line(n));
    }
  }
  return [...lines.values()];
}

/**
 * Toggle Fold: fold or unfold the section that starts on each selected line.
 * A line that starts none (body text, a list item without children) is left
 * alone, as in Obsidian; it never folds the section around it.
 */
export function toggleLineFolds(state: EditorState): StateEffect<Section>[] {
  const effects: StateEffect<Section>[] = [];
  for (const line of selectedLines(state)) {
    const folded = foldedOn(state, line);
    const section = folded ? undefined : foldable(state, line.from, line.to);
    if (folded) {
      effects.push(unfoldEffect.of(folded));
    } else if (section) {
      effects.push(foldEffect.of(section));
    }
  }
  return effects;
}

/**
 * Fold all: fold every section, those inside others too, so that unfolding
 * one leaves the ones inside it folded, as in Obsidian.
 */
export function foldAllEffects(state: EditorState): StateEffect<Section>[] {
  const effects: StateEffect<Section>[] = [];
  for (let n = 1; n <= state.doc.lines; n++) {
    const line = state.doc.line(n);
    const section = foldedOn(state, line)
      ? undefined
      : foldable(state, line.from, line.to);
    if (section) {
      effects.push(foldEffect.of(section));
    }
  }
  return effects;
}

/**
 * The sections around the caret's line, innermost first: the one it starts,
 * then each one above that runs over it.
 */
function sectionsAround(state: EditorState): Section[] {
  const caret = state.doc.lineAt(state.selection.main.head);
  const sections: Section[] = [];
  for (let n = caret.number; n >= 1; n--) {
    const line = state.doc.line(n);
    const section =
      foldedOn(state, line) ?? foldable(state, line.from, line.to);
    if (section && (n === caret.number || section.to >= caret.from)) {
      sections.push(section);
    }
  }
  return sections;
}

const isFolded = (state: EditorState, section: Section): boolean => {
  let folded = false;
  foldedRanges(state).between(section.from, section.from, (from, to) => {
    folded ||= from === section.from && to === section.to;
  });
  return folded;
};

/**
 * Fold more: fold the innermost section around the caret that is still
 * open. Again folds the one around that.
 */
export function foldMoreEffect(
  state: EditorState,
): StateEffect<Section> | undefined {
  const section = sectionsAround(state).find(
    (candidate) => !isFolded(state, candidate),
  );
  return section && foldEffect.of(section);
}

/**
 * Fold less: unfold the outermost folded section around the caret. Again
 * unfolds the next one in.
 */
export function foldLessEffect(
  state: EditorState,
): StateEffect<Section> | undefined {
  const section = sectionsAround(state)
    .reverse()
    .find((candidate) => isFolded(state, candidate));
  return section && unfoldEffect.of(section);
}

/** Run a fold command's effects; true when it changed something. */
export function applyFolds(
  view: EditorView,
  effects: readonly StateEffect<Section>[] | StateEffect<Section> | undefined,
): boolean {
  const list = effects === undefined ? [] : [effects].flat();
  if (list.length === 0) {
    return false;
  }
  view.dispatch({ effects: list });
  return true;
}
