import { EditorSelection, type EditorState } from "@codemirror/state";
import type { EditorView, KeyBinding } from "@codemirror/view";
import { textStart } from "../../markdown/list-markup";
import { HIGHLIGHT_COLOURS } from "../../markdown/dialect/highlight";

const HIGHLIGHT_COLOUR_EMOJI = Object.values(HIGHLIGHT_COLOURS).join("|");

/**
 * Live Preview–hidden openers that can sit after list/quote markup on the
 * first visual line (`**`, `[[`, `[`, `<kbd>`, coloured `==🔵`, …). When
 * CodeMirror's visual line start skips them, Home must still stop at the
 * item's text start first (Obsidian 1.14), the same class of skip End
 * applies to trailing closers. Colour emoji only count right after `==`.
 */
const LEADING_OPENERS = new RegExp(
  `^(?:[*_~=\`$%]+|!?\\[\\[|\\[|%%|<[^>\\n]+>|(?<===)(?:${HIGHLIGHT_COLOUR_EMOJI}))+$`,
  "u",
);

/**
 * Where Home (Cmd+Left on macOS) goes first, as in Obsidian: from inside a
 * list item, task or quote, to the start of its text, after the markup.
 * Returns undefined where the default applies: at or before the text start,
 * on lines without markup, and on wrapped lines after the first.
 *
 * `visualStart` is where the caret's visual line starts: within the markup
 * on the first visual line (Live Preview hides some of it), after the text
 * start on later ones — or, still on the first visual line, past LP-hidden
 * leading openers that follow the markup.
 */
export function lineStartTarget(
  state: EditorState,
  head: number,
  visualStart: number,
): number | undefined {
  const line = state.doc.lineAt(head);
  const start = line.from + textStart(line.text);
  if (start === line.from || head <= start) {
    return undefined;
  }
  if (visualStart > start) {
    const between = state.sliceDoc(start, visualStart);
    if (!between || !LEADING_OPENERS.test(between)) {
      return undefined;
    }
  }
  return start;
}

function toLineStart(extend: boolean) {
  return (view: EditorView): boolean => {
    const { state } = view;
    if (state.selection.ranges.length > 1) {
      return false;
    }
    const range = state.selection.main;
    const visualStart = view.moveToLineBoundary(range, false, true).head;
    const target = lineStartTarget(state, range.head, visualStart);
    if (target === undefined) {
      return false;
    }
    view.dispatch({
      selection: extend
        ? EditorSelection.range(range.anchor, target)
        : EditorSelection.cursor(target),
      scrollIntoView: true,
      userEvent: "select",
    });
    return true;
  };
}

/**
 * Live Preview–hidden closers that can trail the visible line end: emphasis
 * `**`/`__`, highlight `==`, code/math/comment markers, wikilink `]]`,
 * Markdown `](…)` / `][…]`, autolink `>`, and styled inline HTML `</kbd>` /
 * `</u>` / …. End / Cmd+Right steps past any run of these (Obsidian 1.14).
 * One TRAILING_CLOSERS covers link/autolink and HTML closer surfaces.
 */
const TRAILING_CLOSERS =
  /^(?:[*_~=`$%]+|\]\]|\]\([^)\n]*\)|\]\[[^\]\n]*\]|>|<\/[a-z]+>)+$/iu;

/**
 * Where End (Cmd+Right on macOS) goes, as in Obsidian 1.14: past the
 * Live Preview–hidden closers that end the line, to the line's true end.
 * Returns undefined where the default applies: on wrapped lines before the
 * last, and where visible text follows.
 */
export function lineEndTarget(
  state: EditorState,
  visualEnd: number,
): number | undefined {
  const line = state.doc.lineAt(visualEnd);
  const rest = state.sliceDoc(visualEnd, line.to);
  return rest && TRAILING_CLOSERS.test(rest) ? line.to : undefined;
}

function toLineEnd(extend: boolean) {
  return (view: EditorView): boolean => {
    const { state } = view;
    if (state.selection.ranges.length > 1) {
      return false;
    }
    const range = state.selection.main;
    const visualEnd = view.moveToLineBoundary(range, true, true).head;
    const target = lineEndTarget(state, visualEnd);
    if (target === undefined) {
      return false;
    }
    view.dispatch({
      selection: extend
        ? EditorSelection.range(range.anchor, target)
        : EditorSelection.cursor(target),
      scrollIntoView: true,
      userEvent: "select",
    });
    return true;
  };
}

export const lineStartKeymap: readonly KeyBinding[] = [
  { key: "Home", run: toLineStart(false), shift: toLineStart(true) },
  { mac: "Cmd-ArrowLeft", run: toLineStart(false), shift: toLineStart(true) },
  { key: "End", run: toLineEnd(false), shift: toLineEnd(true) },
  { mac: "Cmd-ArrowRight", run: toLineEnd(false), shift: toLineEnd(true) },
];
