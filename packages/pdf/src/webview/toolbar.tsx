import { useZoom } from "@embedpdf/plugin-zoom/react";
import React from "react";
import type { ToolMode, ViewerAction } from "../shared/view-state";
import { postToHost } from "./host";
import type { Navigation } from "./navigation";
import { NumberField } from "./number-field";
import { DOCUMENT_ID, ZOOM_RANGE } from "./plugins";
import { fitMode } from "./view-sync";
import type { ViewChoices } from "../shared/view-settings";
import { ViewControls } from "./view-controls";

const MAC = /Mac|iPhone|iPad/u.test(navigator.userAgent);

/** A keyboard shortcut as the platform writes it, for tooltips. */
function shortcut(mac: string, other: string): string {
  return MAC ? mac : other;
}

/** The viewer's controls, each also a command with a keyboard shortcut. */
export interface ToolbarProps {
  navigation: Navigation;
  tool: ToolMode;
  choices: ViewChoices;
  run: (action: ViewerAction) => void;
  history: {
    back: boolean;
    forward: boolean;
    onBack(): void;
    onForward(): void;
  };
}

function IconButton({
  icon,
  label,
  keys,
  disabled,
  pressed,
  onClick,
}: {
  icon: string;
  /** The accessible name; the tooltip adds the shortcut. */
  label: string;
  keys?: string;
  disabled?: boolean;
  /** For toggles: whether this one is on. */
  pressed?: boolean;
  onClick: () => void;
}): React.JSX.Element {
  return (
    <button
      type="button"
      className={`icon-button${pressed ? " pressed" : ""}`}
      aria-label={label}
      title={keys ? `${label} (${keys})` : label}
      aria-pressed={pressed}
      disabled={disabled}
      onClick={onClick}
    >
      <i className={`codicon codicon-${icon}`} aria-hidden="true" />
    </button>
  );
}

/**
 * The page, zoom, fit, tool, outline and find controls, in groups. The
 * buttons run the same actions as the extension's commands.
 */
export function ToolbarControls({
  navigation,
  tool,
  choices,
  run,
  history,
  compact = false,
}: ToolbarProps & {
  /** Shorter page suffix ("/ 12"), for the floating bar. */
  compact?: boolean;
}): React.JSX.Element {
  const { state } = useZoom(DOCUMENT_ID);
  const { currentPage, pageCount } = navigation;
  const fit = fitMode(state.zoomLevel);
  return (
    <>
      <span className="toolbar-group">
        <IconButton
          icon="arrow-left"
          label="Back to previous location"
          disabled={!history.back}
          onClick={history.onBack}
        />
        <IconButton
          icon="arrow-right"
          label="Forward to next location"
          disabled={!history.forward}
          onClick={history.onForward}
        />
      </span>
      <span className="separator" />
      <span className="toolbar-group">
        <IconButton
          icon="chevron-up"
          label="Previous page"
          keys="Alt+PageUp"
          disabled={!navigation.canGoBack}
          onClick={() => run({ action: "previousPage" })}
        />
        <NumberField
          label="Page"
          value={currentPage}
          suffix={compact ? `/ ${pageCount}` : `of ${pageCount}`}
          onCommit={(page) => {
            if (!Number.isInteger(page)) {
              return false;
            }
            const target = Math.min(Math.max(1, page), pageCount);
            run({ action: "goToPage", page: target });
            return target;
          }}
        />
        <IconButton
          icon="chevron-down"
          label="Next page"
          keys="Alt+PageDown"
          disabled={!navigation.canGoForward}
          onClick={() => run({ action: "nextPage" })}
        />
      </span>
      <span className="separator" />
      <span className="toolbar-group">
        <IconButton
          icon="zoom-out"
          label="Zoom out"
          keys={shortcut("⌘-", "Ctrl+-")}
          onClick={() => run({ action: "zoomOut" })}
        />
        <NumberField
          label="Zoom"
          value={Math.round(state.currentZoomLevel * 100)}
          suffix="%"
          onCommit={(percent) => {
            const level = Math.min(
              ZOOM_RANGE.max,
              Math.max(ZOOM_RANGE.min, percent / 100),
            );
            run({ action: "setZoom", percent: level * 100 });
            return Math.round(level * 100);
          }}
        />
        <IconButton
          icon="zoom-in"
          label="Zoom in"
          keys={shortcut("⌘=", "Ctrl+=")}
          onClick={() => run({ action: "zoomIn" })}
        />
        <IconButton
          icon="arrow-both"
          label="Fit width"
          keys={shortcut("⌘0", "Ctrl+0")}
          pressed={fit === "width"}
          onClick={() => run({ action: "fitWidth" })}
        />
        <IconButton
          icon="screen-full"
          label="Fit page"
          keys={shortcut("⌥⌘0", "Ctrl+Alt+0")}
          pressed={fit === "page"}
          onClick={() => run({ action: "fitPage" })}
        />
      </span>
      <span className="separator" />
      <ViewControls choices={choices} run={run} />
      <span className="separator" />
      <span className="toolbar-group">
        <IconButton
          icon="whole-word"
          label="Select text"
          keys={shortcut("⌃⌘T", "Ctrl+Alt+T")}
          pressed={tool === "text"}
          onClick={() => run({ action: "setTool", tool: "text" })}
        />
        <IconButton
          icon="inspect"
          label="Select region"
          keys={shortcut("⌃⌘R", "Ctrl+Alt+R")}
          pressed={tool === "region"}
          onClick={() => run({ action: "setTool", tool: "region" })}
        />
      </span>
      <span className="spacer" />
      <span className="toolbar-group">
        <IconButton
          icon="list-tree"
          label="Toggle outline"
          keys={shortcut("⌃⌘O", "Ctrl+Alt+O")}
          onClick={() => postToHost({ type: "toggleOutline" })}
        />
        <IconButton
          icon="search"
          label="Find in PDF"
          keys={shortcut("⌘F", "Ctrl+F")}
          onClick={() => run({ action: "find" })}
        />
      </span>
    </>
  );
}

/** The controls as a slim bar along the top of the viewer (`toolbar.mode`: `slim`). */
export function Toolbar(props: ToolbarProps): React.JSX.Element {
  return (
    <div className="toolbar" role="toolbar" aria-label="PDF toolbar">
      <ToolbarControls {...props} />
    </div>
  );
}
