/** The open tabs: click shows one, × or a middle click closes it. */
import type { ReactNode } from "react";
import { tabTitle, type Tab } from "../tabs";

export interface TabStripProps {
  readonly tabs: readonly Tab[];
  readonly active: string | undefined;
  readonly onActivate: (id: string) => void;
  readonly onClose: (id: string) => void;
  /** Shown at the end of the strip (the layout buttons). */
  readonly trailing?: ReactNode;
}

export function TabStrip({
  tabs,
  active,
  onActivate,
  onClose,
  trailing,
}: TabStripProps) {
  return (
    <div className="tab-strip">
      <div className="tabs" role="tablist">
        {tabs.map((tab) => (
          <div
            key={tab.id}
            role="tab"
            className="tab"
            aria-selected={tab.id === active}
            title={tab.kind === "note" ? tab.path : tabTitle(tab)}
            onClick={() => onActivate(tab.id)}
            onAuxClick={(event) => {
              if (event.button === 1) {
                onClose(tab.id);
              }
            }}
          >
            <span className="tab-name">{tabTitle(tab)}</span>
            <button
              type="button"
              className="tab-close"
              aria-label={`Close ${tabTitle(tab)}`}
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
      {trailing}
    </div>
  );
}
