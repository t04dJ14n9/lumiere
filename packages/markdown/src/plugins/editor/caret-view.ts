import { Facet, type Extension } from "@codemirror/state";
import { ViewPlugin, type EditorView, type ViewUpdate } from "@codemirror/view";
import type { CaretModeSource } from "./api";
import {
  caretAppearance,
  type CaretAppearance,
  type CaretSettings,
} from "./caret";
import { measureCarets, type CaretGeometry } from "./caret-geometry";
import { editorSettings } from "./settings";

interface CaretSource extends CaretModeSource {
  settings(view: EditorView): CaretSettings;
}

const nativeSource: CaretSource = {
  mode: () => "typing",
  settings: (view) => view.state.facet(editorSettings),
};
const caretSource = Facet.define<CaretSource, CaretSource>({
  combine: (values) => values.at(-1) ?? nativeSource,
});

class CaretView {
  private source: CaretSource;
  private readonly layer: HTMLElement;
  private appearance: CaretAppearance;
  private unwatch: (() => void) | undefined;
  private isExplicitMove = true;
  private restartsBlink = true;
  private readonly measurement = {
    read: () =>
      measureCarets(this.view, this.appearance, this.source.mode(this.view)),
    write: (geometry: CaretGeometry[]) => this.draw(geometry),
  };

  constructor(private readonly view: EditorView) {
    this.source = view.state.facet(caretSource);
    this.layer = view.scrollDOM.appendChild(
      view.dom.ownerDocument.createElement("div"),
    );
    this.layer.className = "cm-layer cm-cursorLayer mw-caret-layer";
    this.layer.setAttribute("aria-hidden", "true");
    this.appearance = this.applyAppearance();
    this.watchMode();
    this.refresh();
  }

  update(update: ViewUpdate): void {
    const source = update.state.facet(caretSource);
    const sourceChanged = source !== this.source;
    if (sourceChanged) {
      this.unwatch?.();
      this.source = source;
      this.watchMode();
    }
    this.trackMove(update);
    this.appearance = this.applyAppearance();
    this.restartsBlink ||=
      sourceChanged ||
      update.selectionSet ||
      update.docChanged ||
      update.focusChanged;
    if (
      update.geometryChanged ||
      update.viewportChanged ||
      update.focusChanged ||
      update.startState !== update.state
    ) {
      this.view.requestMeasure(this.measurement);
    }
  }

  /**
   * Edits map the caret through text changes; that is not explicit navigation.
   * Plain typing: arrows and clicks are explicit navigation. A modal source
   * moves the selection from code (VSCodeVim does the same, and
   * `cursorSmoothCaretAnimation: explicit` skips it), so only a click counts.
   */
  private trackMove(update: ViewUpdate): void {
    if (!update.selectionSet && !update.docChanged) {
      return;
    }
    const clicked = update.transactions.some((transaction) =>
      transaction.isUserEvent("select.pointer"),
    );
    this.isExplicitMove =
      update.selectionSet &&
      !update.docChanged &&
      (this.source.mode(this.view) === "typing" || clicked);
  }

  private watchMode(): void {
    this.unwatch = this.source.watch?.(this.view, () => this.refresh());
  }

  private refresh(): void {
    this.appearance = this.applyAppearance();
    this.restartsBlink = true;
    this.view.requestMeasure(this.measurement);
  }

  private applyAppearance(): CaretAppearance {
    const mode = this.source.mode(this.view);
    const profile = this.source.profile?.(this.view) ?? "vscodevim";
    const appearance = caretAppearance(
      this.source.settings(this.view),
      mode,
      this.isExplicitMove,
      profile,
    );
    this.view.dom.dataset.caretMode = mode;
    this.view.dom.dataset.caretStyle = appearance.style;
    this.view.dom.dataset.caretProfile = profile;
    for (const [property, value] of Object.entries(appearance.variables)) {
      this.layer.style.setProperty(property, value);
    }
    return appearance;
  }

  private draw(geometries: CaretGeometry[]): void {
    while (this.layer.children.length > geometries.length) {
      this.layer.lastElementChild?.remove();
    }
    geometries.forEach((geometry, index) => {
      const cursor =
        (this.layer.children[index] as HTMLElement | undefined) ??
        this.createCursor();
      Object.assign(cursor.style, {
        left: `${geometry.left}px`,
        top: `${geometry.top}px`,
        width: `${geometry.width}px`,
        height: `${geometry.height}px`,
      });
      const shape = cursor.firstElementChild as HTMLElement;
      Object.assign(shape.style, geometry.font, {
        lineHeight: `${geometry.height}px`,
      });
      shape.textContent = geometry.text;
      shape.dataset.char = geometry.text;
      cursor.dataset.part = geometry.part;
      if (this.restartsBlink) {
        for (const animation of shape.getAnimations()) {
          animation.currentTime = 0;
        }
      }
    });
    this.restartsBlink = false;
  }

  private createCursor(): HTMLElement {
    const cursor = this.layer.appendChild(
      this.view.dom.ownerDocument.createElement("div"),
    );
    cursor.className = "mw-caret";
    const shape = cursor.appendChild(
      this.view.dom.ownerDocument.createElement("span"),
    );
    shape.className = "mw-caret-shape";
    return cursor;
  }

  destroy(): void {
    this.unwatch?.();
    this.layer.remove();
    delete this.view.dom.dataset.caretMode;
    delete this.view.dom.dataset.caretStyle;
  }
}

const caretView = ViewPlugin.fromClass(CaretView);

/** The same plugin instance draws typing carets and any injected modal source. */
export function caretExtension(source?: CaretSource): Extension {
  return [caretView, ...(source ? [caretSource.of(source)] : [])];
}

/** Nested modal editors read the outer note's native settings, as its font does. */
export function caretFactory(settings: () => CaretSettings) {
  return (source: CaretModeSource): Extension =>
    caretExtension({ ...source, settings });
}
