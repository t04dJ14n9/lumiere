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
import { IMAGE_EMBED } from "./embed-actions";
import {
  aliasRange,
  steppedWidth,
  targetRange,
  withWidth,
  writtenWidth,
} from "./image-size";
import { setImageSelectedChrome } from "./image-resize-corner";

interface Range {
  from: number;
  to: number;
}

export const selectImage = StateEffect.define<Range | null>();
export const editImage = StateEffect.define<Range | null>();

/**
 * The image whose source is shown for editing (Enter or Tab on a selected
 * image), until the caret leaves it. Otherwise images stay rendered, as
 * Obsidian 1.13 keeps them whatever the caret does.
 */
export const editingImage = StateField.define<Range | null>({
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
export const selectedImage = StateField.define<Range | null>({
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

/** Enter selects the file name; Tab selects the alias / size segment. */
function editSource(view: EditorView, part: "target" | "alias"): boolean {
  const range = view.state.field(selectedImage);
  if (!range) {
    return false;
  }
  const source = view.state.sliceDoc(range.from, range.to);
  const segment = part === "target" ? targetRange(source) : aliasRange(source);
  if (!segment) {
    return false;
  }
  view.dispatch({
    selection: {
      anchor: range.from + segment.from,
      head: range.from + segment.to,
    },
    effects: editImage.of(range),
  });
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

/**
 * The inspect control Obsidian opens with Space on a selected image (REA
 * showSelectedImage → lightbox). Lumière's frosted-bar ⤢ / inspector is the
 * host equivalent.
 */
export function inspectButtonBesideImage(
  image: HTMLImageElement,
): HTMLButtonElement | null {
  const host = image.closest(`.${IMAGE_EMBED}`) ?? image.parentElement ?? image;
  // querySelector already requires button.inspect-image; cast for stubs/jsdom.
  return host.querySelector("button.inspect-image") as HTMLButtonElement | null;
}

/** Space on a selected image opens its inspector, as Obsidian's Space does. */
function inspectSelected(view: EditorView): boolean {
  const range = view.state.field(selectedImage);
  if (!range) {
    return false;
  }
  const image = imagesOf(view, range)[0];
  if (!image) {
    return false;
  }
  const button = inspectButtonBesideImage(image);
  if (!button) {
    return false;
  }
  button.click();
  return true;
}

/**
 * Escape: leave source edit and re-select (Obsidian exitImageEdit), or clear
 * a selected outline. Enter/Tab clear selectedImage when they move the caret
 * into the source, so Escape must check editingImage first.
 */
export function escapeImage(view: EditorView): boolean {
  const editing = view.state.field(editingImage);
  if (editing) {
    view.dispatch({
      selection: { anchor: editing.from },
      effects: [editImage.of(null), selectImage.of(editing)],
    });
    return true;
  }
  if (!view.state.field(selectedImage)) {
    return false;
  }
  view.dispatch({ effects: selectImage.of(null) });
  return true;
}

/**
 * Map a DOM keydown to the image-selection keymap id (`Space`, `+`, …).
 * Returns undefined when the event is not an image key (or has Mod/Alt).
 */
export function imageKeyFromEvent(
  event: Pick<
    KeyboardEvent,
    "key" | "code" | "shiftKey" | "ctrlKey" | "altKey" | "metaKey"
  >,
): string | undefined {
  if (event.ctrlKey || event.altKey || event.metaKey) {
    return undefined;
  }
  if (event.key === " " || event.code === "Space") {
    return "Space";
  }
  if (event.key === "Escape" || event.key === "Enter" || event.key === "Tab") {
    return event.key;
  }
  if (event.key === "Backspace" || event.key === "Delete") {
    return event.key;
  }
  if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
    return event.key;
  }
  // Unshifted `=` grows; Shift+`=` / key `+` grows (Obsidian binds both).
  if (event.key === "+") {
    return "+";
  }
  if (event.key === "=" || event.code === "Equal") {
    return event.shiftKey ? "+" : "=";
  }
  if (event.key === "-" || event.code === "Minus") {
    return event.shiftKey ? undefined : "-";
  }
  if (event.key === "0" || event.code === "Digit0") {
    return event.shiftKey ? undefined : "0";
  }
  return undefined;
}

/**
 * Run the selected-image action for a keymap id. Used by the CM keymap and by
 * a capture-phase keydown so @replit/codemirror-vim (domEventHandlers) cannot
 * swallow Space / `=` / … while an image is selected (BH-006).
 */
export function runSelectedImageKey(view: EditorView, key: string): boolean {
  switch (key) {
    case "+":
    case "=":
      return resize(view, 1);
    case "-":
      return resize(view, -1);
    case "0":
      return resize(view, 0);
    case "Space":
      return inspectSelected(view);
    case "Enter":
      return editSource(view, "target");
    case "Tab":
      return editSource(view, "alias");
    case "Backspace":
    case "Delete":
      return remove(view);
    case "Escape":
      return escapeImage(view);
    case "ArrowRight":
      return arrow(view, true);
    case "ArrowLeft":
      return arrow(view, false);
    default:
      return false;
  }
}

/** Shows which image is selected. */
const selectedClass = ViewPlugin.define((view) => {
  let marked: HTMLImageElement[] = [];
  const mark = () => {
    const range = view.state.field(selectedImage);
    const images = range ? imagesOf(view, range) : [];
    for (const image of marked) {
      if (!images.includes(image)) {
        setImageSelectedChrome(image, false);
      }
    }
    for (const image of images) {
      setImageSelectedChrome(image, true);
    }
    marked = images;
    // Obsidian shows the outline only; a caret at the embed would use the
    // widget's (often overestimated) height and paint a long bar below.
    if (images.length) {
      view.dom.dataset.mwImageSelected = "";
    } else {
      delete view.dom.dataset.mwImageSelected;
    }
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
  // Capture precedes vim's keydown domEventHandler so Space/= grow/inspect
  // while selected (BH-006). CM Prec.highest keymap alone is too late.
  const onKeydown = (event: KeyboardEvent): void => {
    if (
      event.defaultPrevented ||
      event.isComposing ||
      event.target !== view.contentDOM
    ) {
      return;
    }
    const selected = view.state.field(selectedImage);
    const editing = view.state.field(editingImage);
    if (!selected && !editing) {
      return;
    }
    const key = imageKeyFromEvent(event);
    if (!key) {
      return;
    }
    // Source edit: only Escape is ours; Space must insert a space.
    if (editing && !selected && key !== "Escape") {
      return;
    }
    if (!runSelectedImageKey(view, key)) {
      return;
    }
    event.preventDefault();
    event.stopImmediatePropagation();
  };
  view.contentDOM.addEventListener("keydown", onKeydown, true);
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
      view.contentDOM.removeEventListener("keydown", onKeydown, true);
      for (const image of marked) {
        setImageSelectedChrome(image, false);
      }
      delete view.dom.dataset.mwImageSelected;
    },
  };
});

/**
 * Selecting and editing images in Live Preview, as Obsidian 1.13 does
 * (measured): a click, or an arrow key from just beside it, selects an
 * image; then `+`/`=` and `-` resize it in steps of 25 pixels, `0` resets
 * its size, Space opens the inspector (Obsidian lightbox), Enter selects
 * its file name, Tab selects its alias / size segment (Obsidian
 * `editSelectedImageAlias`), Backspace or Delete removes it, and Escape
 * leaves source edit (re-selecting) or clears the outline. Selection also
 * paints Obsidian's `.image-resize-corner` chevron chrome (CSS);
 * drag-to-resize is still `+`/`-` only. Keys also bind in a capture-phase
 * keydown so Vim cannot swallow them while the image is selected (BH-006).
 */
export function imageSelection(): Extension {
  return [
    selectedImage,
    editingImage,
    selectedClass,
    Prec.highest(
      keymap.of(
        (
          [
            "+",
            "=",
            "-",
            "0",
            "Space",
            "Enter",
            "Tab",
            "Backspace",
            "Delete",
            "Escape",
            "ArrowRight",
            "ArrowLeft",
          ] as const
        ).map((key) => ({
          key,
          run: (view: EditorView) => runSelectedImageKey(view, key),
        })),
      ),
    ),
  ];
}
