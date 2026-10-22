/**
 * The sidebar, as in Typora: the vault's files, or the shown note's outline.
 * More of the plugins' trees (Backlinks, Tags) can join as tabs: each is one
 * TreePanel with its view id from `@workshop/host-node/views`.
 */
import { useState, type ReactNode } from "react";
import { VIEW_IDS } from "@workshop/host-node/views";
import { TreePanel } from "./TreePanel";

type SidebarTab = "files" | "outline";

const TAB_KEY = "lumiere.sidebar.tab";

export interface SidebarProps {
  /** The vault bar and file tree. */
  readonly files: ReactNode;
  readonly report: (work: Promise<unknown>) => void;
}

export function Sidebar({ files, report }: SidebarProps) {
  const [tab, setTab] = useState<SidebarTab>(savedTab);
  const choose = (next: SidebarTab) => {
    setTab(next);
    try {
      localStorage.setItem(TAB_KEY, next);
    } catch {
      // Remembering the tab is a convenience; storage may be unavailable.
    }
  };
  return (
    <aside className="sidebar">
      <div className="sidebar-tabs" role="tablist" aria-label="Sidebar">
        <SidebarTabButton tab="files" shown={tab} onChoose={choose}>
          Files
        </SidebarTabButton>
        <SidebarTabButton tab="outline" shown={tab} onChoose={choose}>
          Outline
        </SidebarTabButton>
      </div>
      <div className="sidebar-body" hidden={tab !== "files"}>
        {files}
      </div>
      <div className="sidebar-body" hidden={tab !== "outline"}>
        <TreePanel
          viewId={VIEW_IDS.outline}
          visible={tab === "outline"}
          unavailable="Open a note to see its outline."
          report={report}
        />
      </div>
    </aside>
  );
}

function SidebarTabButton({
  tab,
  shown,
  onChoose,
  children,
}: {
  readonly tab: SidebarTab;
  readonly shown: SidebarTab;
  readonly onChoose: (tab: SidebarTab) => void;
  readonly children: ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={tab === shown}
      className="sidebar-tab"
      onClick={() => onChoose(tab)}
    >
      {children}
    </button>
  );
}

function savedTab(): SidebarTab {
  try {
    return localStorage.getItem(TAB_KEY) === "outline" ? "outline" : "files";
  } catch {
    return "files";
  }
}
