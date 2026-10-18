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
const editImage = StateEffect.define<Range>();

/**
 * The image whose source is shown for editing (Enter or Tab on a selected
 * image), until the caret leaves it. Otherwise images stay rendered, as
 * Obsidian 1.13 keeps them whatever the caret does.
 */
const editingImage = StateField.define<Range | null>({
  create: () => null,
  update(value, transaction) {
    for (const effect of transaction.effects) {
      if (effect.is(editImage)) {
        return effect.value;
      }
    }
    if (!value) {
      return null;
    }
    const from = transaction.changes.mapPos(value.from, -1);
    const to = transaction.changes.mapPos(value.to, 1);
    const head = transaction.state.selection.main.head;
    return head >= from && head <= to ? { from, to } : null;
  },
});

/** Whether the image at `from`–`to` shows its source for editing. */
export function editingImageAt(
  state: EditorState,
  range: { from: number; to: number },
): boolean {
  const editing = state.field(editingImage, false);
  return Boolean(
    editing && editing.from <= range.from && editing.to >= range.to,
  );
}

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

/** The image embeds (`![[a.png]]`, `![](a.png)`) on the line holding `at`. */
function imagesOnLine(state: EditorState, at: number): Range[] {
  const line = state.doc.lineAt(at);
  const found: Range[] = [];
  syntaxTree(state).iterate({
    from: line.from,
    to: line.to,
    enter(node) {
      if (!["WikiEmbed", "Image"].includes(node.name)) {
        return true;
      }
      if (!embedsNote(state.sliceDoc(node.from, node.to))) {
        found.push({ from: node.from, to: node.to });
      }
      return false;
    },
  });
  return found;
}

/** The image embed drawn at `at`: the one around it, else the next on its line. */
function embedAt(state: EditorState, at: number): Range | undefined {
  const images = imagesOnLine(state, at);
  return (
    images.find((range) => at >= range.from && at <= range.to) ??
    images.find((range) => range.from >= at)
  );
}

/**
 * The rendered images of the selected embed: those drawn at its source (a
 * block's image may report its block's start or end).
 */
function imagesOf(view: EditorView, range: Range): HTMLImageElement[] {
  return [...view.contentDOM.querySelectorAll("img")].filter((image) => {
    try {
      const at = view.posAtDOM(image);
      return at >= range.from && at <= range.to;
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
  const effects = editImage.of(range);
  if (part === "target" && target) {
    view.dispatch({
      selection: {
        anchor: range.from + target.from,
        head: range.from + target.to,
      },
      effects,
    });
  } else if (part === "size" && size !== undefined) {
    view.dispatch({ selection: { anchor: range.from + size }, effects });
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

/**
 * An arrow key next to an image, as in Obsidian 1.13: with the caret just
 * before it (Right) or just after it (Left) the first press selects it, the
 * caret staying; with it selected, the press moves past it.
 */
function arrow(view: EditorView, forward: boolean): boolean {
  const { state } = view;
  const selected = state.field(selectedImage);
  if (selected) {
    view.dispatch({
      selection: { anchor: forward ? selected.to : selected.from },
      effects: selectImage.of(null),
    });
    return true;
  }
  const { main } = state.selection;
  if (!main.empty || state.selection.ranges.length > 1) {
    return false;
  }
  const next = imagesOnLine(state, main.head).find((range) =>
    forward ? range.from === main.head : range.to === main.head,
  );
  if (!next) {
    return false;
  }
  view.dispatch({ effects: selectImage.of(next) });
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
  const mark = () => {
    const range = view.state.field(selectedImage);
    const images = range ? imagesOf(view, range) : [];
    for (const image of marked) {
      if (!images.includes(image)) {
        image.classList.remove("md-image-selected");
      }
    }
    for (const image of images) {
      image.classList.add("md-image-selected");
    }
    marked = images;
  };
  // A resized image is drawn again once its file loads, replacing elements:
  // mark whatever is drawn while one is selected.
  const redrawn = new MutationObserver(() => {
    if (view.state.field(selectedImage) || marked.length) {
      mark();
    }
  });
  redrawn.observe(view.contentDOM, { childList: true, subtree: true });
  const onClick = (event: MouseEvent) => selectOnClick(view, event);
  view.contentDOM.addEventListener("mousedown", onClick, { capture: true });
  return {
    update(update) {
      const before = update.startState.field(selectedImage);
      const after = update.state.field(selectedImage);
      if (before !== after || (after && update.docChanged)) {
        // After the widgets are drawn for this update.
        view.requestMeasure({ read: () => null, write: mark });
      }
    },
    destroy() {
      redrawn.disconnect();
      view.contentDOM.removeEventListener("mousedown", onClick, {
        capture: true,
      });
      for (const image of marked) {
        image.classList.remove("md-image-selected");
      }
    },
  };
});

/**
 * Selecting and editing images in Live Preview, as Obsidian 1.13 does
 * (measured): a click, or an arrow key from just beside it, selects an
 * image; then `+` and `-` resize it in steps
 * of 25 pixels, `0` resets its size, Enter selects its file name, Tab puts
 * the caret where its size goes, Backspace or Delete removes it and Escape
 * lets it go.
 */
export function imageSelection(): Extension {
  return [
    selectedImage,
    editingImage,
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
        { key: "ArrowRight", run: (view) => arrow(view, true) },
        { key: "ArrowLeft", run: (view) => arrow(view, false) },
      ]),
    ),
  ];
}
