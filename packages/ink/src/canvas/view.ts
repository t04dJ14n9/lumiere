/**
 * The canvas's elements, laid out as the iPad's: a bar with Cancel, the
 * sketch's name, undo, redo and Done; the paper, filling the window under
 * it; and the tools floating at the bottom, where PencilKit's tool picker
 * sits.
 *
 * The paper has no edge, so it is drawn on two canvases the size of the
 * view, wherever the view looks: `base` holds the paper and the strokes
 * drawn, `live` the stroke being drawn. The surface under them takes the
 * pointer and the wheel.
 */
import {
  confirmStyle,
  dialogStyle,
  discardStyle,
  doneStyle,
  headerStyle,
  iconButtonStyle,
  keepStyle,
  layerStyle,
  mainStyle,
  paletteStyle,
  surfaceStyle,
  styled,
  titleStyle,
  buttonStyle,
} from "./styles";

export interface CanvasView {
  readonly dialog: HTMLDialogElement;
  readonly cancel: HTMLButtonElement;
  readonly undo: HTMLButtonElement;
  readonly redo: HTMLButtonElement;
  readonly done: HTMLButtonElement;
  /** Where the pointer draws, pans and zooms: the whole view. */
  readonly surface: HTMLDivElement;
  readonly base: HTMLCanvasElement;
  readonly live: HTMLCanvasElement;
  readonly palette: HTMLDivElement;
  readonly confirm: ConfirmView;
}

export interface ConfirmView {
  readonly panel: HTMLDivElement;
  readonly discard: HTMLButtonElement;
  readonly keep: HTMLButtonElement;
}

export function buildCanvasView(title: string): CanvasView {
  const dialog = styled(document.createElement("dialog"), dialogStyle);
  dialog.setAttribute("aria-label", `Sketch: ${title}`);
  const cancel = button("Cancel", buttonStyle);
  const undo = iconButton("Undo", "M8 5 3 10l5 5M3 10h11a6 6 0 0 1 0 12h-4");
  const redo = iconButton("Redo", "m16 5 5 5-5 5m5-5H10a6 6 0 0 0 0 12h4");
  const done = button("Done", doneStyle);
  const heading = styled(document.createElement("div"), titleStyle);
  heading.textContent = title;
  const header = styled(document.createElement("div"), headerStyle);
  header.append(cancel, heading, undo, redo, done);

  const main = styled(document.createElement("div"), mainStyle);
  const surface = styled(document.createElement("div"), surfaceStyle);
  // Focusable, so the canvas's keys reach it and not the note behind it.
  surface.tabIndex = -1;
  const base = styled(document.createElement("canvas"), layerStyle);
  const live = styled(document.createElement("canvas"), layerStyle);
  const palette = styled(document.createElement("div"), paletteStyle);
  palette.setAttribute("role", "toolbar");
  palette.setAttribute("aria-label", "Tools");
  main.append(surface, base, live, palette);

  const confirm = buildConfirm();
  dialog.append(header, main, confirm.panel);
  return {
    dialog,
    cancel,
    undo,
    redo,
    done,
    surface,
    base,
    live,
    palette,
    confirm,
  };
}

/** Cancel asks first when something was drawn, as on the iPad. */
function buildConfirm(): ConfirmView {
  const panel = styled(document.createElement("div"), confirmStyle);
  panel.setAttribute("role", "alertdialog");
  panel.setAttribute("aria-label", "Discard this drawing?");
  showConfirm({ panel }, false);
  const discard = button("Discard Changes", discardStyle);
  const keep = button("Keep Drawing", keepStyle);
  panel.append(discard, keep);
  return { panel, discard, keep };
}

/** Shown or hidden through its style: its own `display` outranks `hidden`. */
export function showConfirm(
  confirm: Pick<ConfirmView, "panel">,
  isShown: boolean,
): void {
  confirm.panel.style.display = isShown ? "flex" : "none";
}

function button(
  label: string,
  style: Parameters<typeof styled>[1],
): HTMLButtonElement {
  const element = styled(document.createElement("button"), style);
  element.type = "button";
  element.textContent = label;
  return element;
}

function iconButton(label: string, path: string): HTMLButtonElement {
  const element = styled(document.createElement("button"), iconButtonStyle);
  element.type = "button";
  element.title = label;
  element.setAttribute("aria-label", label);
  const svgNs = "http://www.w3.org/2000/svg";
  const icon = document.createElementNS(svgNs, "svg");
  icon.setAttribute("viewBox", "0 0 24 24");
  icon.setAttribute("width", "20");
  icon.setAttribute("height", "20");
  icon.setAttribute("fill", "none");
  icon.setAttribute("stroke", "currentColor");
  icon.setAttribute("stroke-width", "2");
  icon.setAttribute("stroke-linecap", "round");
  icon.setAttribute("stroke-linejoin", "round");
  const shape = document.createElementNS(svgNs, "path");
  shape.setAttribute("d", path);
  icon.append(shape);
  element.append(icon);
  return element;
}
