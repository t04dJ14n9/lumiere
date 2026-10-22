/**
 * The outline of the shown note, in the panel on the right (VS Code's
 * secondary side bar). It is the Outline plugin's own tree; Backlinks or
 * Tags could sit below it the same way, each a TreePanel.
 */
import { VIEW_IDS } from "@workshop/host-node/views";
import { TreePanel } from "./TreePanel";

export interface OutlinePanelProps {
  readonly onHide: () => void;
  readonly report: (work: Promise<unknown>) => void;
}

export function OutlinePanel({ onHide, report }: OutlinePanelProps) {
  return (
    <aside className="side-panel outline-panel" aria-label="Outline">
      <header className="panel-header">
        <span>Outline</span>
        <button
          type="button"
          title="Hide Outline (⌥⌘B)"
          aria-label="Hide Outline"
          onClick={onHide}
        >
          ×
        </button>
      </header>
      <TreePanel
        viewId={VIEW_IDS.outline}
        visible
        unavailable="Open a note to see its outline."
        report={report}
      />
    </aside>
  );
}
