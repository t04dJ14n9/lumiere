/**
 * One of the plugins' tree views (Outline, Backlinks…), drawn from host-node's
 * snapshot. A click runs the node's command in the host: for Outline that
 * scrolls the note to the heading. The plugin's reveals (Follow Cursor) mark
 * the current node and bring it into view.
 */
import { useEffect, useRef, useState } from "react";
import type { TreeItem, TreeSnapshot } from "@workshop/host-node/views";
import { ancestors, expandTo, isExpanded, type Toggled } from "../tree-state";
import { backend } from "../backend";

/** Changes this close together are read as one. */
const REFRESH_DELAY_MS = 30;

export interface TreePanelProps {
  readonly viewId: string;
  /** Whether the panel is on screen; the host hears it too. */
  readonly visible: boolean;
  /** Shown while the plugin has not registered the tree (or is turned off). */
  readonly unavailable: string;
  /** A node's command was run. */
  readonly onRun?: () => void;
  readonly report: (work: Promise<unknown>) => void;
}

export function TreePanel({
  viewId,
  visible,
  unavailable,
  onRun,
  report,
}: TreePanelProps) {
  const snapshot = useSnapshot(viewId, report);
  const [toggled, setToggled] = useState<Toggled>(new Map());
  const [current, setCurrent] = useState<string>();
  const list = useRef<HTMLDivElement>(null);

  useVisibility(viewId, visible, report);
  useEffect(
    () =>
      backend().views.events((event) => {
        if (event.type === "reveal" && event.viewId === viewId) {
          setCurrent(event.id);
        }
      }),
    [viewId],
  );
  // Open the way to the current node and scroll it into view.
  useEffect(() => {
    const path = current && snapshot && ancestors(snapshot.items, current);
    if (path) {
      setToggled((value) => expandTo(value, path));
    }
  }, [current, snapshot]);
  useEffect(() => {
    if (current && visible) {
      list.current
        ?.querySelector(`[data-node="${CSS.escape(current)}"]`)
        ?.scrollIntoView({ block: "nearest" });
    }
  }, [current, visible, toggled]);

  if (!snapshot) {
    return <p className="tree-message">{unavailable}</p>;
  }
  const toggle = (item: TreeItem) =>
    setToggled((value) =>
      new Map(value).set(item.id, !isExpanded(item, value)),
    );
  return (
    <div className="tree-panel" ref={list}>
      {snapshot.message && <p className="tree-message">{snapshot.message}</p>}
      <TreeItems
        items={snapshot.items}
        depth={0}
        state={{
          toggled,
          current,
          toggle,
          run: (item) => {
            report(backend().views.run(viewId, item.id));
            onRun?.();
          },
        }}
      />
    </div>
  );
}

/** Tell the host whether the tree is on screen: some plugins follow the caret only then. */
function useVisibility(
  viewId: string,
  visible: boolean,
  report: (work: Promise<unknown>) => void,
): void {
  useEffect(() => {
    report(backend().views.setVisible(viewId, visible));
    return () => {
      if (visible) {
        report(backend().views.setVisible(viewId, false));
      }
    };
  }, [viewId, visible, report]);
}

/** The tree, read again whenever its plugin says it changed. */
function useSnapshot(
  viewId: string,
  report: (work: Promise<unknown>) => void,
): TreeSnapshot | undefined {
  const [snapshot, setSnapshot] = useState<TreeSnapshot>();
  useEffect(() => {
    let live = true;
    let pending = false;
    const load = () => {
      // Several changes in a row read the tree once. A timer, not an
      // animation frame: WebKit runs no frames while the window is covered,
      // and the outline must be right when it is uncovered.
      if (pending) {
        return;
      }
      pending = true;
      setTimeout(() => {
        pending = false;
        report(
          backend()
            .views.snapshot(viewId)
            .then((next) => live && setSnapshot(next)),
        );
      }, REFRESH_DELAY_MS);
    };
    load();
    const stop = backend().views.events((event) => {
      if (event.type === "changed" && event.viewId === viewId) {
        load();
      }
    });
    return () => {
      live = false;
      stop();
    };
  }, [viewId, report]);
  return snapshot;
}

interface TreeState {
  readonly toggled: Toggled;
  readonly current: string | undefined;
  toggle(item: TreeItem): void;
  run(item: TreeItem): void;
}

function TreeItems({
  items,
  depth,
  state,
}: {
  readonly items: readonly TreeItem[];
  readonly depth: number;
  readonly state: TreeState;
}) {
  return (
    <ul role={depth === 0 ? "tree" : "group"}>
      {items.map((item) => {
        const open = isExpanded(item, state.toggled);
        return (
          <li
            key={item.id}
            role="treeitem"
            aria-expanded={item.children ? open : undefined}
          >
            <TreeRow item={item} depth={depth} open={open} state={state} />
            {item.children && open && (
              <TreeItems
                items={item.children}
                depth={depth + 1}
                state={state}
              />
            )}
          </li>
        );
      })}
    </ul>
  );
}

function TreeRow({
  item,
  depth,
  open,
  state,
}: {
  readonly item: TreeItem;
  readonly depth: number;
  readonly open: boolean;
  readonly state: TreeState;
}) {
  return (
    <div
      className="tree-row"
      data-node={item.id}
      aria-current={item.id === state.current ? "location" : undefined}
      style={{ paddingLeft: 8 + depth * 14 }}
    >
      {item.children ? (
        <button
          type="button"
          className="tree-twisty"
          aria-label={open ? "Collapse" : "Expand"}
          onClick={() => state.toggle(item)}
        >
          {open ? "▾" : "▸"}
        </button>
      ) : (
        <span className="tree-twisty" />
      )}
      <button
        type="button"
        className="tree-label"
        title={item.tooltip ?? item.label}
        disabled={!item.runnable}
        onClick={() => state.run(item)}
      >
        {item.label}
        {item.description && (
          <span className="tree-description">{item.description}</span>
        )}
      </button>
    </div>
  );
}
