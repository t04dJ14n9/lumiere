/** The open files as tabs: click shows one, × or a middle click closes it. */
import type { Tab } from "../tabs";

export interface TabStripProps {
  readonly tabs: readonly Tab[];
  readonly active: string | undefined;
  readonly onActivate: (id: string) => void;
  readonly onClose: (id: string) => void;
}

export function TabStrip({ tabs, active, onActivate, onClose }: TabStripProps) {
  return (
    <div className="tab-strip" role="tablist">
      {tabs.map((tab) => (
        <div
          key={tab.id}
          role="tab"
          className="tab"
          aria-selected={tab.id === active}
          title={tab.path}
          onClick={() => onActivate(tab.id)}
          onAuxClick={(event) => {
            if (event.button === 1) {
              onClose(tab.id);
            }
          }}
        >
          <span className="tab-name">{tabName(tab.path)}</span>
          <button
            type="button"
            className="tab-close"
            aria-label={`Close ${tabName(tab.path)}`}
            onClick={(event) => {
              event.stopPropagation();
              onClose(tab.id);
            }}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}

function tabName(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1).replace(/\.(md|markdown)$/i, "");
}
