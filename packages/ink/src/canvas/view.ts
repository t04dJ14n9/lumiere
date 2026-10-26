/**
 * The canvas's elements, laid out as the iPad's: a bar with Cancel, the
 * sketch's name, undo, redo and Done; the page, scrolling under it; and the
 * tools floating at the bottom, where PencilKit's tool picker sits.
 *
 * The page is drawn on two canvases the size of the view, not of the page,
 * which grows too tall for one canvas: `base` holds the paper and the
 * strokes drawn, `live` the stroke being drawn. The sheet under them is
 * what scrolls and takes the pointer.
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
  scrollerStyle,
  sheetStyle,
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
  readonly scroller: HTMLDivElement;
  /** As tall as the scrolled content. */
  readonly content: HTMLDivElement;
  /** Where the pointer draws: the page and the room below it. */
  readonly sheet: HTMLDivElement;
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
  const scroller = styled(document.createElement("div"), scrollerStyle);
  const content = styled(document.createElement("div"), {
    position: "relative",
  });
  const sheet = styled(document.createElement("div"), sheetStyle);
  // Focusable, so the canvas's keys reach it and not the note behind it.
  sheet.tabIndex = -1;
  content.append(sheet);
  scroller.append(content);
  const base = styled(document.createElement("canvas"), layerStyle);
  const live = styled(document.createElement("canvas"), layerStyle);
  const palette = styled(document.createElement("div"), paletteStyle);
  palette.setAttribute("role", "toolbar");
  palette.setAttribute("aria-label", "Tools");
  main.append(scroller, base, live, palette);

  const confirm = buildConfirm();
  dialog.append(header, main, confirm.panel);
  return {
    dialog,
    cancel,
    undo,
    redo,
    done,
    scroller,
    content,
    sheet,
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
