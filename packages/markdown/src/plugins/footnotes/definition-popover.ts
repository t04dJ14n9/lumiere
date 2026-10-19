import { EditorState, type ChangeSpec, type Text } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { footnotes } from "../../markdown/metadata/footnotes";
import { placePreview } from "../../webview/ui/popover-position";

/** What follows `[^label]:` before the definition's text. */
const MARKER = /^\[\^[^\]]+\]:[ \t]?/u;

/** A definition's text as one edits it: continued lines without their indent. */
export function definitionText(doc: Text, label: string): string | undefined {
  const note = footnotes(doc).definitions.find((item) => item.label === label);
  if (!note) {
    return undefined;
  }
  const source = doc.sliceString(note.from, note.to);
  return source.replace(MARKER, "").replace(/\n(?:\t| {1,4})/gu, "\n");
}

/**
 * The change writing `text` as the definition of `label`, as Obsidian's
 * popover writes it: after `[^label]: `, each further line indented by a tab
 * so it continues the footnote.
 */
export function definitionChange(
  doc: Text,
  label: string,
  text: string,
): ChangeSpec | undefined {
  const note = footnotes(doc).definitions.find((item) => item.label === label);
  if (!note) {
    return undefined;
  }
  const marker = MARKER.exec(doc.sliceString(note.from, note.to))?.[0] ?? "";
  return {
    from: note.from + marker.length,
    to: note.to,
    insert: text.replace(/\n/gu, "\n\t"),
  };
}

/** The popover's own editor, writing each change to the note's definition. */
function definitionEditor(
  view: EditorView,
  label: string,
  parent: HTMLElement,
  close: () => void,
): EditorView {
  return new EditorView({
    parent,
    state: EditorState.create({
      doc: definitionText(view.state.doc, label) ?? "",
      extensions: [
        keymap.of([{ key: "Escape", run: () => (close(), true) }]),
        EditorView.updateListener.of((update) => {
          if (!update.docChanged) {
            return;
          }
          const change = definitionChange(
            view.state.doc,
            label,
            update.state.doc.toString(),
          );
          if (change) {
            view.dispatch({ changes: change, userEvent: "input.footnote" });
          }
        }),
      ],
    }),
  });
}

/** Put `popover` under the reference ending at `at`, inside the window. */
function placeUnder(popover: HTMLElement, view: EditorView, at: number): void {
  const reference = view.coordsAtPos(at);
  if (!reference) {
    return;
  }
  const root = popover.ownerDocument.documentElement;
  const place = placePreview(popover.getBoundingClientRect(), reference, {
    width: root.clientWidth,
    height: root.clientHeight,
  });
  popover.style.left = `${place.left}px`;
  popover.style.top = `${place.top}px`;
}

/**
 * Edit the definition of `label` in a popover under its reference (ending at
 * `at`), as Obsidian 1.14 does after Insert Footnote: what is typed goes to
 * the definition at the end of the note, Enter continues it on a new line,
 * and Escape or a click elsewhere closes it, back at the reference.
 * Returns a function that closes it.
 */
export function editDefinition(
  view: EditorView,
  label: string,
  at: number,
): () => void {
  const popover = view.dom.ownerDocument.createElement("div");
  popover.className = "mw-footnote-popover";
  popover.setAttribute("role", "dialog");
  popover.setAttribute("aria-label", `Footnote ${label}`);
  let open = true;
  const close = () => {
    if (open) {
      open = false;
      editor.destroy();
      popover.remove();
      view.focus();
    }
  };
  const editor = definitionEditor(view, label, popover, close);
  view.dom.ownerDocument.body.append(popover);
  placeUnder(popover, view, at);
  popover.addEventListener("focusout", (event) => {
    if (!popover.contains(event.relatedTarget as Node | null)) {
      close();
    }
  });
  editor.focus();
  editor.dispatch({ selection: { anchor: editor.state.doc.length } });
  return close;
}
