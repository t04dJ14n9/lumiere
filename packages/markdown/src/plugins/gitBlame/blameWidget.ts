import { StateEffect, StateField } from "@codemirror/state";
import type { EditorState, Extension } from "@codemirror/state";
import { layer } from "@codemirror/view";
import type { EditorView, LayerMarker } from "@codemirror/view";
import type { GitIdentity } from "../../shared/git-blame";
import { blameField } from "./state";
import { formatBlameGhost, formatBlameTooltip } from "./format";
import { canPaintBlameAt } from "./paintable";
import { blameHover } from "./blameTooltip";

export const setBlameIdentity = StateEffect.define<GitIdentity | undefined>();
export const blameIdentityField = StateField.define<GitIdentity | undefined>({
  create: () => undefined,
  update(value, transaction) {
    for (const effect of transaction.effects) {
      if (effect.is(setBlameIdentity)) {
        value = effect.value;
      }
    }
    return value;
  },
});

/** The caret line's authorship, and the end of that line it follows. */
export interface BlameGhost {
  readonly anchor: number;
  readonly text: string;
  readonly tooltip: string;
}

function ghostFor(state: EditorState): BlameGhost | null {
  const blame = state.field(blameField);
  if (!blame || blame.line > state.doc.lines) {
    return null;
  }
  const anchor = state.doc.line(blame.line).to;
  if (!canPaintBlameAt(state, anchor)) {
    return null;
  }
  const identity = state.field(blameIdentityField);
  return {
    anchor,
    text: formatBlameGhost(blame, identity),
    tooltip: formatBlameTooltip(blame, identity),
  };
}

function isSameGhost(a: BlameGhost | null, b: BlameGhost | null): boolean {
  return (
    a === b ||
    (!!a &&
      !!b &&
      a.anchor === b.anchor &&
      a.text === b.text &&
      a.tooltip === b.tooltip)
  );
}

export const blameGhostField = StateField.define<BlameGhost | null>({
  create: ghostFor,
  // Keep the same object while nothing changed, so the layer can skip work.
  update(value, transaction) {
    const next = ghostFor(transaction.state);
    return isSameGhost(value, next) ? value : next;
  },
});

/** Space between the end of the text and the ghost, in body-text ems. */
const GAP_EM = 2.5;
/** Less room than this after the text, and the ghost is not shown. */
const MIN_WIDTH_EM = 10;
/** Kept clear at the editor's right edge. */
const EDGE_EM = 1;

export interface GhostPlacement {
  readonly left: number;
  /** The vertical middle of the line's last row. */
  readonly middle: number;
  readonly width: number;
}

/**
 * Where the ghost goes, in client pixels, after the end of the line's last
 * row: it uses the free space up to the editor's visible right edge, the
 * margin beside a readable-width column included, and is not shown when too
 * little is left. It is centred on the row's text, so headings of any size
 * and body lines both get it level with their words.
 */
export function placeGhost(
  lineEnd: { right: number; top: number; bottom: number },
  visibleRight: number,
  textSize: number,
): GhostPlacement | null {
  const left = lineEnd.right + GAP_EM * textSize;
  const width = visibleRight - EDGE_EM * textSize - left;
  if (width < MIN_WIDTH_EM * textSize) {
    return null;
  }
  return { left, middle: (lineEnd.top + lineEnd.bottom) / 2, width };
}

/** The ghost as a layer marker, positioned relative to the scroller. */
export class BlameGhostMarker implements LayerMarker {
  constructor(
    readonly text: string,
    readonly left: number,
    readonly middle: number,
    readonly width: number,
  ) {}
  eq(other: LayerMarker): boolean {
    return (
      other instanceof BlameGhostMarker &&
      other.text === this.text &&
      other.left === this.left &&
      other.middle === this.middle &&
      other.width === this.width
    );
  }
  draw(): HTMLElement {
    const dom = document.createElement("div");
    dom.className = "mw-gb-ghost";
    dom.setAttribute("aria-hidden", "true");
    this.update(dom);
    return dom;
  }
  update(dom: HTMLElement): boolean {
    dom.textContent = this.text;
    dom.style.left = `${this.left}px`;
    dom.style.top = `${this.middle}px`;
    dom.style.maxWidth = `${this.width}px`;
    return true;
  }
}

/** Measures the caret line's end; runs in the layer's measure phase. */
function ghostMarkers(view: EditorView): readonly LayerMarker[] {
  const ghost = view.state.field(blameGhostField);
  const lineEnd = ghost && view.coordsAtPos(ghost.anchor, -1);
  if (!ghost || !lineEnd) {
    return [];
  }
  const scroller = view.scrollDOM.getBoundingClientRect();
  const visibleRight = scroller.left + view.scrollDOM.clientWidth * view.scaleX;
  const textSize = parseFloat(getComputedStyle(view.contentDOM).fontSize) || 16;
  const place = placeGhost(lineEnd, visibleRight, textSize);
  if (!place) {
    return [];
  }
  // The same origin CodeMirror's own layers (selection, cursor) use.
  const left = scroller.left - view.scrollDOM.scrollLeft * view.scaleX;
  const top = scroller.top - view.scrollDOM.scrollTop * view.scaleY;
  return [
    new BlameGhostMarker(
      ghost.text,
      place.left - left,
      place.middle - top,
      place.width,
    ),
  ];
}

/**
 * Drawn in a layer above the text rather than as an inline widget, so it
 * takes no room in the line: no line changes height or wraps for it, the
 * text never moves under the caret, and the caret (Vim's block one too)
 * never covers it.
 */
const ghostLayer = layer({
  above: true,
  class: "mw-gb-layer",
  update: (update) =>
    update.state.field(blameGhostField) !==
      update.startState.field(blameGhostField) || update.viewportChanged,
  markers: ghostMarkers,
});

export const blameOverlay: Extension = [
  blameGhostField,
  ghostLayer,
  blameHover((state) => state.field(blameGhostField)?.tooltip || undefined),
];
