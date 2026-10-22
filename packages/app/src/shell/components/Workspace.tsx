/** An open vault: files or outline on the left, the open notes as tabs on the right. */
import type { Dispatch } from "react";
import type { VaultState } from "../hooks";
import type { Opening } from "../opening";
import type { TabsAction, TabsState } from "../tabs";
import { EditorFrame } from "./EditorFrame";
import { FileTree } from "./FileTree";
import { Sidebar } from "./Sidebar";
import { TabStrip } from "./TabStrip";

export interface WorkspaceProps {
  /** The vault the file tree shows. */
  readonly vault: string;
  readonly vaults: VaultState;
  readonly tabs: TabsState;
  readonly dispatch: Dispatch<TabsAction>;
  readonly opening: Opening;
  readonly report: (work: Promise<unknown>) => void;
}

export function Workspace({
  vault,
  vaults,
  tabs,
  dispatch,
  opening,
  report,
}: WorkspaceProps) {
  const shown = tabs.tabs.find((tab) => tab.id === tabs.active);
  return (
    <div className="app">
      <Sidebar
        report={report}
        files={
          <>
            <VaultBar vault={vault} vaults={vaults} opening={opening} />
            <FileTree
              files={vaults.files}
              activePath={shown?.vault === vault ? shown.path : undefined}
              onOpen={(path) => dispatch({ type: "open", vault, path })}
            />
          </>
        }
      />
      <main className="editors">
        <TabStrip
          tabs={tabs.tabs}
          active={tabs.active}
          onActivate={(id) => dispatch({ type: "activate", id })}
          onClose={(id) => dispatch({ type: "close", id })}
        />
        {tabs.tabs.map((tab) => (
          <EditorFrame
            key={tab.id}
            tab={tab}
            visible={tab.id === tabs.active}
            onOpen={opening.openPath}
          />
        ))}
        {tabs.tabs.length === 0 && (
          <p className="empty">Choose a note on the left.</p>
        )}
      </main>
    </div>
  );
}

function VaultBar({
  vault,
  vaults,
  opening,
}: Pick<WorkspaceProps, "vault" | "vaults" | "opening">) {
  return (
    <header className="vault-bar">
      <select
        aria-label="Vault"
        value={vault}
        onChange={(event) => vaults.select(event.target.value)}
      >
        {vaults.open.map((item) => (
          <option key={item} value={item}>
            {item.split(/[\\/]/).at(-1)}
          </option>
        ))}
      </select>
      <button
        type="button"
        title="Open a folder of notes"
        aria-label="Open a folder of notes"
        onClick={() => opening.openVault()}
      >
        +
      </button>
    </header>
  );
}
