import { BlockType, GutterMarker, gutter } from "@codemirror/view";
import type { BlockInfo, EditorView } from "@codemirror/view";
import type { Extension } from "@codemirror/state";
import type { DocHunk } from "./api";
import { hunkField } from "./hunks";

/** Hover / aria text for a gutter bar color. */
export function barTooltip(kind: DocHunk["kind"] | "deleted-end"): string {
  return kind === "deleted-end" ? "deleted" : kind;
}

class BarMarker extends GutterMarker {
  constructor(
    readonly kind: DocHunk["kind"] | "deleted-end",
    readonly open: boolean,
  ) {
    super();
  }
  override eq(other: GutterMarker): boolean {
    return (
      other instanceof BarMarker &&
      other.kind === this.kind &&
      other.open === this.open
    );
  }
  override toDOM(): Node {
    const bar = document.createElement("div");
    bar.className = `mw-git-bar mw-git-bar-${this.kind}${this.open ? " is-open" : ""}`;
    const tip = barTooltip(this.kind);
    bar.title = tip;
    bar.setAttribute("aria-label", tip);
    return bar;
  }
}

const markers = new Map<string, BarMarker>();
function marker(kind: BarMarker["kind"], open: boolean): BarMarker {
  const key = `${kind}:${open}`;
  let found = markers.get(key);
  if (!found) {
    markers.set(key, (found = new BarMarker(kind, open)));
  }
  return found;
}

/**
 * One bar per visual block. A rendered block (table, code, math) hides several
 * source lines and gets one bar for the whole block, the same way it gets one
 * line number; a removal inside it marks it modified.
 */
export function kindFor(
  hunks: readonly DocHunk[],
  from: number,
  to: number,
  docLength: number,
): BarMarker["kind"] | undefined {
  const rank = { modified: 3, added: 2, deleted: 1, "deleted-end": 1 } as const;
  let kind: BarMarker["kind"] | undefined;
  const take = (next: BarMarker["kind"]) => {
    if (!kind || rank[next] > rank[kind]) {
      kind = next;
    }
  };
  for (const hunk of hunks) {
    if (hunk.kind !== "deleted") {
      if (hunk.from <= to && hunk.to >= from) {
        take(hunk.kind);
      }
    } else if (hunk.atEnd) {
      if (to === docLength) {
        take("deleted-end");
      }
    } else if (hunk.from === from) {
      take("deleted");
    } else if (hunk.from > from && hunk.from <= to) {
      // A removal inside a rendered block changes the block.
      take("modified");
    }
  }
  return kind;
}

export function changeGutter(options: {
  isOpen(view: EditorView, from: number, to: number): boolean;
  click(view: EditorView, from: number, to: number): void;
}): Extension {
  const lineMarker = (view: EditorView, line: BlockInfo) => {
    const hunks = view.state.field(hunkField, false)?.hunks ?? [];
    if (hunks.length === 0) {
      return null;
    }
    const kind = kindFor(hunks, line.from, line.to, view.state.doc.length);
    return kind ? marker(kind, options.isOpen(view, line.from, line.to)) : null;
  };
  return gutter({
    class: "mw-git-gutter",
    lineMarker,
    // A rendered table or other block widget that replaces source lines; not
    // point widgets such as the peek itself.
    widgetMarker: (view, _widget, block) =>
      block.type === BlockType.WidgetRange ? lineMarker(view, block) : null,
    lineMarkerChange: (update) =>
      update.startState.field(hunkField, false) !==
        update.state.field(hunkField, false) ||
      update.transactions.some(
        (tr) => tr.reconfigured || tr.effects.length > 0,
      ),
    domEventHandlers: {
      mousedown(view, line, event) {
        if ((event as MouseEvent).button !== 0) {
          return false;
        }
        const { hunks } = view.state.field(hunkField);
        if (!kindFor(hunks, line.from, line.to, view.state.doc.length)) {
          return false;
        }
        event.preventDefault();
        options.click(view, line.from, line.to);
        return true;
      },
    },
  });
}
