import { syntaxTree } from "@codemirror/language";
import {
  Prec,
  StateEffect,
  StateField,
  type EditorState,
  type Extension,
} from "@codemirror/state";
import { ViewPlugin, keymap, type EditorView } from "@codemirror/view";
import { embedsNote } from "./clicks";
import { keepRendered } from "../../webview/ui/pointer-selection";
import {
  sizeOffset,
  steppedWidth,
  targetRange,
  withWidth,
  writtenWidth,
} from "./image-size";

interface Range {
  from: number;
  to: number;
}

const selectImage = StateEffect.define<Range | null>();

/**
 * The image embed a click selected, as Obsidian 1.13 selects images: its
 * source. Any other edit or move of the caret lets it go.
 */
const selectedImage = StateField.define<Range | null>({
  create: () => null,
  update(value, transaction) {
    for (const effect of transaction.effects) {
      if (effect.is(selectImage)) {
        return effect.value;
      }
    }
    return value && !transaction.docChanged && !transaction.selection
      ? value
      : null;
  },
});

/** The image embed (`![[a.png]]`, `![](a.png)`) starting at or after `at` on its line. */
function embedAt(state: EditorState, at: number): Range | undefined {
  const line = state.doc.lineAt(at);
  let found: Range | undefined;
  syntaxTree(state).iterate({
    from: at,
    to: line.to,
    enter(node) {
      if (found || !["WikiEmbed", "Image"].includes(node.name)) {
        return !found;
      }
      if (node.from >= at) {
        found = { from: node.from, to: node.to };
      }
      return false;
    },
  });
  if (!found || embedsNote(state.sliceDoc(found.from, found.to))) {
    return undefined;
  }
  return found;
}

/** The rendered images of the selected embed. */
function imagesOf(view: EditorView, range: Range): HTMLImageElement[] {
  return [...view.contentDOM.querySelectorAll("img")].filter((image) => {
    try {
      return embedAt(view.state, view.posAtDOM(image))?.from === range.from;
    } catch {
      return false;
    }
  });
}

/** A click on an image selects it, the caret at its start, as in Obsidian. */
function selectOnClick(view: EditorView, event: MouseEvent): void {
  const image =
    event.target instanceof HTMLImageElement ? event.target : undefined;
  if (
    !image ||
    event.button !== 0 ||
    event.shiftKey ||
    event.metaKey ||
    event.ctrlKey ||
    event.altKey ||
    image.closest("a, button")
  ) {
    return;
  }
  const range = embedAt(view.state, view.posAtDOM(image));
  if (!range) {
    return;
  }
  event.preventDefault();
  event.stopPropagation();
  view.focus();
  view.dispatch({
    selection: { anchor: range.from },
    effects: selectImage.of(range),
  });
}

/** The widest an image can be: the width of the note's text. */
function maxWidth(view: EditorView): number {
  const style = getComputedStyle(view.contentDOM);
  return (
    view.contentDOM.clientWidth -
    parseFloat(style.paddingLeft) -
    parseFloat(style.paddingRight)
  );
}

function resize(view: EditorView, change: 1 | -1 | 0): boolean {
  const range = view.state.field(selectedImage);
  if (!range) {
    return false;
  }
  const source = view.state.sliceDoc(range.from, range.to);
  let width: number | undefined;
  if (change !== 0) {
    // The image as shown (a hidden placeholder may share its source).
    const shown = Math.max(
      0,
      ...imagesOf(view, range).map(
        (image) => image.getBoundingClientRect().width,
      ),
    );
    const current = writtenWidth(source) ?? shown / view.scaleX;
    width = steppedWidth(current, change, maxWidth(view));
  }
  const insert = withWidth(source, width);
  view.dispatch({
    changes: { from: range.from, to: range.to, insert },
    effects: selectImage.of({
      from: range.from,
      to: range.from + insert.length,
    }),
  });
  return true;
}

/** Enter selects the file name, Tab puts the caret where the size goes. */
function editSource(view: EditorView, part: "target" | "size"): boolean {
  const range = view.state.field(selectedImage);
  if (!range) {
    return false;
  }
  const source = view.state.sliceDoc(range.from, range.to);
  const target = targetRange(source);
  const size = sizeOffset(source);
  if (part === "target" && target) {
    view.dispatch({
      selection: {
        anchor: range.from + target.from,
        head: range.from + target.to,
      },
    });
  } else if (part === "size" && size !== undefined) {
    view.dispatch({ selection: { anchor: range.from + size } });
  }
  return true;
}

function remove(view: EditorView): boolean {
  const range = view.state.field(selectedImage);
  if (!range) {
    return false;
  }
  view.dispatch({
    changes: { from: range.from, to: range.to },
    selection: { anchor: range.from },
  });
  return true;
}

function deselect(view: EditorView): boolean {
  if (!view.state.field(selectedImage)) {
    return false;
  }
  view.dispatch({ effects: selectImage.of(null) });
  return true;
}

/** Shows which image is selected. */
const selectedClass = ViewPlugin.define((view) => {
  let marked: HTMLImageElement[] = [];
  let frame = 0;
  const mark = (tries = 30) => {
    cancelAnimationFrame(frame);
    for (const image of marked) {
      image.classList.remove("md-image-selected");
    }
    const range = view.state.field(selectedImage);
    marked = range ? imagesOf(view, range) : [];
    for (const image of marked) {
      image.classList.add("md-image-selected");
    }
    // A resized image is drawn again once its file loads: mark it then.
    if (range && !marked.length && tries > 0) {
      frame = requestAnimationFrame(() => mark(tries - 1));
    }
  };
  const onClick = (event: MouseEvent) => selectOnClick(view, event);
  view.contentDOM.addEventListener("mousedown", onClick, { capture: true });
  return {
    update(update) {
      const before = update.startState.field(selectedImage);
      const after = update.state.field(selectedImage);
      if (before !== after || (after && update.docChanged)) {
        // After the widgets are drawn for this update.
        view.requestMeasure({ read: () => null, write: () => mark() });
      }
    },
    destroy() {
      view.contentDOM.removeEventListener("mousedown", onClick, {
        capture: true,
      });
      cancelAnimationFrame(frame);
      for (const image of marked) {
        image.classList.remove("md-image-selected");
      }
    },
  };
});

/**
 * Selecting and editing images in Live Preview, as Obsidian 1.13 does
 * (measured): a click selects an image; then `+` and `-` resize it in steps
 * of 25 pixels, `0` resets its size, Enter selects its file name, Tab puts
 * the caret where its size goes, Backspace or Delete removes it and Escape
 * lets it go.
 */
export function imageSelection(): Extension {
  return [
    selectedImage,
    keepRendered.of((state) => state.field(selectedImage)),
    selectedClass,
    Prec.highest(
      keymap.of([
        { key: "+", run: (view) => resize(view, 1) },
        { key: "-", run: (view) => resize(view, -1) },
        { key: "0", run: (view) => resize(view, 0) },
        { key: "Enter", run: (view) => editSource(view, "target") },
        { key: "Tab", run: (view) => editSource(view, "size") },
        { key: "Backspace", run: remove },
        { key: "Delete", run: remove },
        { key: "Escape", run: deselect },
      ]),
    ),
  ];
}
