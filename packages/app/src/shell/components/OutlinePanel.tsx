/**
 * The outline of the shown note, in the panel on the right (VS Code's
 * secondary side bar). It is the Outline plugin's own tree; Backlinks or
 * Tags could sit below it the same way, each a TreePanel.
 */
import { VIEW_IDS } from "@workshop/host-node/views";
import { TreePanel } from "./TreePanel";

export interface OutlinePanelProps {
  /** Over the note, in a narrow window (panels.ts). */
  readonly floating: boolean;
  readonly onHide: () => void;
  /** A heading was chosen. */
  readonly onChoose: () => void;
  readonly report: (work: Promise<unknown>) => void;
}

export function OutlinePanel({
  floating,
  onHide,
  onChoose,
  report,
}: OutlinePanelProps) {
  const className = floating
    ? "side-panel outline-panel floating-panel"
    : "side-panel outline-panel";
  return (
    <aside className={className} aria-label="Outline">
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
        onRun={onChoose}
        report={report}
      />
    </aside>
  );
}
