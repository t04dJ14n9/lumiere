import { EditorView, Decoration, WidgetType } from "@codemirror/view";
import type { EditorState } from "@codemirror/state";
import { markerState, type OwnedMarker } from "./view-state";
type Activate = (owner: string, markerId: string) => void;
class MarkerBadge extends WidgetType {
  constructor(
    readonly entry: OwnedMarker,
    private readonly activate: Activate,
  ) {
    super();
  }
  override eq(other: MarkerBadge): boolean {
    return (
      this.activate === other.activate &&
      JSON.stringify(this.entry) === JSON.stringify(other.entry)
    );
  }
  override toDOM(view: EditorView): HTMLElement {
    const button = view.dom.ownerDocument.createElement("button");
    button.type = "button";
    button.className = "md-source-marker";
    button.textContent = this.entry.marker.label;
    button.title = this.entry.marker.tooltip ?? "";
    button.disabled = !this.entry.marker.actionId;
    button.onclick = (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.activate(this.entry.owner, this.entry.marker.id);
    };
    return button;
  }
  override destroy(dom: HTMLElement): void {
    dom.onclick = null;
  }
  override ignoreEvent(): boolean {
    return true;
  }
}
export function markerDecorations(
  activate: Activate,
  placement: (
    state: EditorState,
    position: number,
  ) => { position: number; block: boolean },
) {
  return EditorView.decorations.compute([markerState], (state) =>
    Decoration.set(
      state.field(markerState).map((entry) => {
        const target = placement(state, entry.marker.to);
        return Decoration.widget({
          widget: new MarkerBadge(entry, activate),
          side: 1,
          block: target.block,
        }).range(target.position);
      }),
      true,
    ),
  );
}
