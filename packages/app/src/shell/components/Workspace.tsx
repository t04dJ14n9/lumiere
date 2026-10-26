/**
 * The window, laid out as VS Code: the vault's files on the left, the open
 * notes (and Settings) as tabs in the middle, the shown note's outline on
 * the right. Either side can be hidden; in a narrow window they float over
 * the note instead (panels.ts).
 */
import type { Dispatch, ReactNode } from "react";
import { backend } from "../backend";
import type { VaultState } from "../hooks";
import type { Opening } from "../opening";
import type { Panels } from "../panels";
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
  readonly panels: Panels;
  readonly report: (work: Promise<unknown>) => void;
}

export function Workspace(props: WorkspaceProps) {
  const { tabs, dispatch, panels, report } = props;
  const { narrow } = panels;
  const columns = narrow
    ? "minmax(0, 1fr)"
    : [panels.sidebar && "260px", "minmax(0, 1fr)", panels.outline && "240px"]
        .filter(Boolean)
        .join(" ");
  const sidebar = panels.sidebar && <FilesSidebar {...props} />;
  const outline = panels.outline && (
    <OutlinePanel
      floating={narrow}
      onHide={() => panels.hide("outline")}
      onChoose={panels.dismiss}
      report={report}
    />
  );
  return (
    <div className="app" style={{ gridTemplateColumns: columns }}>
      {!narrow && sidebar}
      <main className="editors">
        <TabStrip
          tabs={tabs.tabs}
          active={tabs.active}
          onActivate={(id) => dispatch({ type: "activate", id })}
          onClose={(id) => dispatch({ type: "close", id })}
          trailing={
            <LayoutButtons
              panels={panels}
              onSettings={() => dispatch({ type: "openSettings" })}
            />
          }
        />
        <TabBodies {...props}>
          {narrow && (sidebar || outline) && (
            // A tap on the note puts a floating panel away, as a popover goes.
            <div className="panel-scrim" onClick={panels.dismiss} />
          )}
          {narrow && sidebar}
          {narrow && outline}
        </TabBodies>
      </main>
      {!narrow && outline}
    </div>
  );
}

function TabBodies({
  tabs,
  opening,
  ui,
  panels,
  report,
  children,
}: WorkspaceProps & { readonly children: ReactNode }) {
  return (
    // Every tab stays laid out at full size, hidden or not (styles.css).
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
        <div className="empty">
          {panels.narrow ? (
            <button
              type="button"
              className="primary"
              onClick={() => panels.toggle("sidebar")}
            >
              Choose a Note…
            </button>
          ) : (
            <p>Choose a note on the left.</p>
          )}
        </div>
      )}
      {children}
    </div>
  );
}

function FilesSidebar({
  vault,
  vaults,
  tabs,
  dispatch,
  opening,
  ui,
  panels,
}: WorkspaceProps) {
  const shown = tabs.tabs.find((tab) => tab.id === tabs.active);
  const className = panels.narrow ? "sidebar floating-panel" : "sidebar";
  return (
    <aside className={className} aria-label="Files">
      {vault ? (
        <>
          <VaultBar
            vault={vault}
            vaults={vaults}
            opening={opening}
            onHide={() => panels.hide("sidebar")}
          />
          <FileTree
            // Each vault's list starts afresh, revealing the shown note again.
            key={vault}
            vault={vault}
            files={vaults.files}
            activePath={
              shown?.kind === "note" && shown.vault === vault
                ? shown.path
                : undefined
            }
            opens={backend().editors.kinds ?? ["note"]}
            ui={ui}
            onOpen={(path) => {
              dispatch({ type: "open", vault, path });
              panels.dismiss();
            }}
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
  onHide,
}: {
  readonly vault: string;
  readonly vaults: VaultState;
  readonly opening: Opening;
  readonly onHide: () => void;
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
      <button
        type="button"
        title="Hide Files (⌘B)"
        aria-label="Hide Files"
        onClick={onHide}
      >
        ×
      </button>
    </header>
  );
}
