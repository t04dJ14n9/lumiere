import {
  EditorSelection,
  type ChangeSet,
  type ChangeSpec,
  type EditorState,
  type SelectionRange,
} from "@codemirror/state";
import type { Command } from "@codemirror/view";
import {
  HIGHLIGHT_COLOURS,
  type HighlightColour,
} from "../../markdown/dialect/highlight";
import { spanContent, spansIn, type Span } from "./spans";

/** A highlight's colour, `"default"` for a plain one. */
type Tint = HighlightColour | "default";

const opening = (tint: Tint) =>
  tint === "default" ? "==" : `==${HIGHLIGHT_COLOURS[tint]}`;

/**
 * **Toggle red highlight** and the other colours, as Obsidian 1.14 toggles
 * them (measured): the selected text, or the word at the caret, takes the
 * colour; a highlight it is in keeps its colour around it, split at the
 * selection, and highlights it spans merge. Toggling a highlight's own
 * colour removes it. Each line of a selection is its own.
 */
export function toggleHighlightColour(colour: HighlightColour): Command {
  return (view) => {
    if (view.state.readOnly) {
      return false;
    }
    const changes = view.state.changeByRange((range) =>
      colourRange(view.state, range, colour),
    );
    view.dispatch({ ...changes, userEvent: "input" });
    return true;
  };
}

function colourRange(
  state: EditorState,
  range: SelectionRange,
  colour: HighlightColour,
) {
  if (range.empty) {
    return colourAtCaret(state, range.from, colour);
  }
  const parts = lineParts(state, range).map((part) =>
    colourPart(state, part, colour),
  );
  if (!parts.length) {
    return { range };
  }
  const set = state.changes(parts.flatMap((part) => part.changes));
  // The selection stays on the same text, now inside its highlight.
  const from = parts[0]!.place(set).from;
  const to = parts.at(-1)!.place(set).to;
  return {
    changes: set,
    range:
      range.head < range.anchor
        ? EditorSelection.range(to, from)
        : EditorSelection.range(from, to),
  };
}

/** The caret's highlight is recoloured, or removed in its own colour; else its word is wrapped. */
function colourAtCaret(
  state: EditorState,
  at: number,
  colour: HighlightColour,
) {
  const span = spansIn(state, "Highlight", at - 1, at + 1).find(
    (candidate) => at >= candidate.from && at <= candidate.to,
  );
  if (span) {
    const changes: ChangeSpec[] =
      span.colour === colour
        ? [
            { from: span.from, to: span.from + span.open },
            { from: span.to - span.close, to: span.to },
          ]
        : [
            {
              from: span.from,
              to: span.from + span.open,
              insert: opening(colour),
            },
          ];
    const set = state.changes(changes);
    return { changes: set, range: EditorSelection.cursor(set.mapPos(at)) };
  }
  const word = state.wordAt(at) ?? { from: at, to: at };
  const insert = `${opening(colour)}${state.sliceDoc(word.from, word.to)}==`;
  return {
    changes: { from: word.from, to: word.to, insert },
    range: EditorSelection.cursor(at + opening(colour).length),
  };
}

/** Each line's selected part, without its spaces at either end. */
function lineParts(
  state: EditorState,
  range: SelectionRange,
): { from: number; to: number }[] {
  const parts: { from: number; to: number }[] = [];
  const last = state.doc.lineAt(range.to).number;
  for (let n = state.doc.lineAt(range.from).number; n <= last; n++) {
    const line = state.doc.line(n);
    let from = Math.max(line.from, range.from);
    let to = Math.min(line.to, range.to);
    while (from < to && /\s/u.test(state.sliceDoc(from, from + 1))) {
      from++;
    }
    while (to > from && /\s/u.test(state.sliceDoc(to - 1, to))) {
      to--;
    }
    if (to > from) {
      parts.push({ from, to });
    }
  }
  return parts;
}

/** A line's edit, and where its selected text is once the edit is made. */
interface PartEdit {
  changes: ChangeSpec[];
  place(set: ChangeSet): { from: number; to: number };
}

/**
 * One line's part: removed when it is all in a highlight of the colour, or
 * else the stretch it and its highlights cover written again, each run of
 * text in its colour (the part's, or its highlight's), with spaces at a run's
 * ends left outside.
 */
function colourPart(
  state: EditorState,
  selected: { from: number; to: number },
  colour: HighlightColour,
): PartEdit {
  const spans = spansIn(state, "Highlight", selected.from, selected.to);
  // A selection starting or ending on a highlight's markers means its text.
  const part = { ...selected };
  for (const span of spans) {
    const content = spanContent(span);
    if (part.from >= span.from && part.from < content.from) {
      part.from = content.from;
    }
    if (part.to <= span.to && part.to > content.to) {
      part.to = content.to;
    }
  }
  if (part.to <= part.from) {
    return { changes: [], place: () => selected };
  }
  const within = spans.find(
    (span) =>
      part.from >= spanContent(span).from && part.to <= spanContent(span).to,
  );
  if (within?.colour === colour) {
    return {
      changes: [
        { from: within.from, to: within.from + within.open },
        { from: within.to - within.close, to: within.to },
      ],
      place: (set) => ({
        from: set.mapPos(part.from, 1),
        to: set.mapPos(part.to, -1),
      }),
    };
  }
  const from = Math.min(part.from, spans[0]?.from ?? part.from);
  const to = Math.max(part.to, spans.at(-1)?.to ?? part.to);
  const written = rewritten(state, {
    stretch: { from, to },
    part,
    spans,
    colour,
  });
  return {
    changes: [{ from, to, insert: written.text }],
    place: (set) => {
      const start = set.mapPos(from, -1);
      return { from: start + written.from, to: start + written.to };
    },
  };
}

/** A stretch of a line to write again, with the part to colour. */
interface Rewrite {
  stretch: { from: number; to: number };
  part: { from: number; to: number };
  spans: readonly Span[];
  colour: HighlightColour;
}

interface Run {
  tint: Tint | undefined;
  /** Each character and where it was. */
  chars: { at: number; char: string }[];
}

/** The colour a character of the stretch takes: the part's, or its highlight's. */
function tintAt(
  at: number,
  part: { from: number; to: number },
  span: Span | undefined,
  colour: HighlightColour,
): Tint | undefined {
  if (at >= part.from && at < part.to) {
    return colour;
  }
  return span ? (span.colour ?? "default") : undefined;
}

function runsOf(
  state: EditorState,
  { stretch, part, spans, colour }: Rewrite,
): Run[] {
  const runs: Run[] = [];
  for (let at = stretch.from; at < stretch.to; at++) {
    const span = spans.find((s) => at >= s.from && at < s.to);
    const content = span && spanContent(span);
    if (content && (at < content.from || at >= content.to)) {
      continue; // a marker or colour emoji
    }
    const tint = tintAt(at, part, span, colour);
    const char = { at, char: state.sliceDoc(at, at + 1) };
    const run = runs.at(-1);
    if (run && run.tint === tint) {
      run.chars.push(char);
    } else {
      runs.push({ tint, chars: [char] });
    }
  }
  return runs;
}

/** The stretch written again, and where the part's text starts and ends in it. */
function rewritten(
  state: EditorState,
  rewrite: Rewrite,
): { text: string; from: number; to: number } {
  let text = "";
  const placed = new Map<number, number>();
  const write = (chars: Run["chars"]) => {
    for (const { at, char } of chars) {
      placed.set(at, text.length);
      text += char;
    }
  };
  for (const { tint, chars } of runsOf(state, rewrite)) {
    const isSpace = (c: { char: string }) => /\s/u.test(c.char);
    const first = chars.findIndex((c) => !isSpace(c));
    if (tint === undefined || first < 0) {
      write(chars);
      continue;
    }
    const last =
      chars.length - [...chars].reverse().findIndex((c) => !isSpace(c));
    write(chars.slice(0, first));
    text += opening(tint);
    write(chars.slice(first, last));
    text += "==";
    write(chars.slice(last));
  }
  const { part } = rewrite;
  return {
    text,
    from: placed.get(part.from)!,
    to: placed.get(part.to - 1)! + 1,
  };
}
