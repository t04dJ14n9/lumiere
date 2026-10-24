/**
 * The window, laid out as VS Code: the vault's files on the left, the open
 * notes (and Settings) as tabs in the middle, the shown note's outline on
 * the right. Either side can be hidden; the layout is kept between launches.
 */
import type { Dispatch } from "react";
import type { VaultState } from "../hooks";
import type { Opening } from "../opening";
import type { TabsAction, TabsState } from "../tabs";
import type { UiStateHandle } from "../ui-state";
import { EditorFrame } from "./EditorFrame";
import { FileTree } from "./FileTree";
import { LayoutButtons } from "./LayoutButtons";
import { OutlinePanel } from "./OutlinePanel";
import { SettingsEditor } from "./SettingsEditor";
import { TabStrip } from "./TabStrip";

export interface WorkspaceProps {
  /** The vault the file tree shows, if one is open. */
  readonly vault: string | undefined;
  readonly vaults: VaultState;
  readonly tabs: TabsState;
  readonly dispatch: Dispatch<TabsAction>;
  readonly opening: Opening;
  readonly ui: UiStateHandle;
  readonly report: (work: Promise<unknown>) => void;
}

export function Workspace(props: WorkspaceProps) {
  const { tabs, dispatch, opening, ui, report } = props;
  const { sidebar, outline } = ui.state;
  const columns = [sidebar && "260px", "minmax(0, 1fr)", outline && "240px"]
    .filter(Boolean)
    .join(" ");
  return (
    <div className="app" style={{ gridTemplateColumns: columns }}>
      {sidebar && <FilesSidebar {...props} />}
      <main className="editors">
        <TabStrip
          tabs={tabs.tabs}
          active={tabs.active}
          onActivate={(id) => dispatch({ type: "activate", id })}
          onClose={(id) => dispatch({ type: "close", id })}
          trailing={
            <LayoutButtons
              ui={ui}
              onSettings={() => dispatch({ type: "openSettings" })}
            />
          }
        />
        {/* Every tab stays laid out at full size, hidden or not (styles.css). */}
        <div className="tab-bodies">
          {tabs.tabs.map((tab) =>
            tab.kind === "note" ? (
              <EditorFrame
                key={tab.id}
                tab={tab}
                visible={tab.id === tabs.active}
                onOpen={opening.openPath}
              />
            ) : (
              <SettingsEditor
                key={tab.id}
                visible={tab.id === tabs.active}
                ui={ui}
                report={report}
              />
            ),
          )}
          {tabs.tabs.length === 0 && (
            <p className="empty">Choose a note on the left.</p>
          )}
        </div>
      </main>
      {outline && (
        <OutlinePanel
          onHide={() => ui.update({ outline: false })}
          report={report}
        />
      )}
    </div>
  );
}

function FilesSidebar({
  vault,
  vaults,
  tabs,
  dispatch,
  opening,
}: WorkspaceProps) {
  const shown = tabs.tabs.find((tab) => tab.id === tabs.active);
  return (
    <aside className="sidebar" aria-label="Files">
      {vault ? (
        <>
          <VaultBar vault={vault} vaults={vaults} opening={opening} />
          <FileTree
            files={vaults.files}
            activePath={
              shown?.kind === "note" && shown.vault === vault
                ? shown.path
                : undefined
            }
            onOpen={(path) => dispatch({ type: "open", vault, path })}
          />
        </>
      ) : (
        <button
          type="button"
          className="primary sidebar-open"
          onClick={() => opening.openVault()}
        >
          Open Folder…
        </button>
      )}
    </aside>
  );
}

function VaultBar({
  vault,
  vaults,
  opening,
}: {
  readonly vault: string;
  readonly vaults: VaultState;
  readonly opening: Opening;
}) {
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
        title="Open a folder of notes (⌘O)"
        aria-label="Open a folder of notes"
        onClick={() => opening.openVault()}
      >
        +
      </button>
    </header>
  );
}
