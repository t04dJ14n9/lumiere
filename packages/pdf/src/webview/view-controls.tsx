import { useZoom } from "@embedpdf/plugin-zoom/react";
import React, { useId, useRef } from "react";
import {
  PAGE_LAYOUTS,
  SCROLL_DIRECTIONS,
  SCROLL_MODES,
} from "../shared/view-options";
import type { ViewChoices } from "../shared/view-settings";
import { parseViewerAction, type ViewerAction } from "../shared/view-state";
import { NumberField } from "./number-field";
import { DOCUMENT_ID, ZOOM_RANGE } from "./plugins";
import { fitMode } from "./view-sync";

/** A native popover stays visible over every floating-toolbar dock and supports light dismissal. */
export function ViewControls({
  choices,
  run,
}: {
  choices: ViewChoices;
  run: (action: ViewerAction) => void;
}): React.JSX.Element {
  const id = useId();
  const menu = useRef<HTMLDivElement>(null);
  const act = (value: unknown): void => {
    const action = parseViewerAction(value);
    if (action) {
      run(action);
    }
  };
  return (
    <span className="toolbar-group">
      <button
        type="button"
        className="view-button"
        popoverTarget={id}
        aria-label="View controls"
        title="Choose zoom, page layout and scrolling"
      >
        <i className="codicon codicon-layout" aria-hidden="true" /> View
      </button>
      <div
        id={id}
        popover="auto"
        ref={menu}
        className="view-menu"
        role="group"
        aria-label="PDF view controls"
      >
        <ZoomControls menu={menu} act={act} run={run} />
        <LayoutControls choices={choices} act={act} />
      </div>
    </span>
  );
}

/** Page layout, scrolling and direction. */
function LayoutControls({
  choices,
  act,
}: {
  choices: ViewChoices;
  act: (value: unknown) => void;
}): React.JSX.Element {
  return (
    <>
      <ChoiceSelect
        label="Page layout"
        name="Page layout"
        value={choices.pageLayout}
        options={PAGE_LAYOUTS}
        onChange={(pageLayout) => act({ action: "setPageLayout", pageLayout })}
      />
      <ChoiceSelect
        label="Scrolling"
        name="Scroll mode"
        value={choices.scrollMode}
        options={SCROLL_MODES}
        onChange={(scrollMode) => act({ action: "setScrollMode", scrollMode })}
      />
      <ChoiceSelect
        label="Direction"
        name="Scroll direction"
        value={choices.scrollDirection}
        options={SCROLL_DIRECTIONS}
        onChange={(scrollDirection) =>
          act({ action: "setScrollDirection", scrollDirection })
        }
      />
    </>
  );
}

/** The zoom mode, and a custom percentage. */
function ZoomControls({
  menu,
  act,
  run,
}: {
  menu: React.RefObject<HTMLDivElement | null>;
  act: (value: unknown) => void;
  run: (action: ViewerAction) => void;
}): React.JSX.Element {
  const { state: zoom } = useZoom(DOCUMENT_ID);
  const mode = zoomMode(fitMode(zoom.zoomLevel), zoom.currentZoomLevel);
  return (
    <>
      <label>
        Zoom mode
        <select
          aria-label="Zoom mode"
          value={mode}
          onChange={(event) => {
            if (event.target.value === "custom") {
              menu.current?.querySelector<HTMLInputElement>("input")?.focus();
            } else {
              act({ action: event.target.value });
            }
          }}
        >
          <option value="fitWidth">Fit width</option>
          <option value="fitPage">Fit page</option>
          <option value="actualSize">Actual size (100%)</option>
          <option value="custom">Custom percentage</option>
        </select>
      </label>
      <label>
        Percentage
        <NumberField
          label="Custom zoom"
          value={Math.round(zoom.currentZoomLevel * 100)}
          suffix="%"
          onCommit={(percent) => {
            const target = Math.min(
              ZOOM_RANGE.max * 100,
              Math.max(ZOOM_RANGE.min * 100, percent),
            );
            run({ action: "setZoom", percent: target });
            return target;
          }}
        />
      </label>
    </>
  );
}

/** One labelled select of the View menu: page layout, scrolling or direction. */
function ChoiceSelect(props: {
  label: string;
  /** The accessible name. */
  name: string;
  value: string;
  options: readonly { value: string; label: string }[];
  onChange: (value: string) => void;
}): React.JSX.Element {
  return (
    <label>
      {props.label}
      <select
        aria-label={props.name}
        value={props.value}
        onChange={(event) => props.onChange(event.target.value)}
      >
        {props.options.map((item) => (
          <option key={item.value} value={item.value}>
            {item.label}
          </option>
        ))}
      </select>
    </label>
  );
}

/** Which of the View menu's zoom entries the current zoom is. */
function zoomMode(
  fit: ReturnType<typeof fitMode>,
  level: number,
): "fitWidth" | "fitPage" | "actualSize" | "custom" {
  if (fit === "width") {
    return "fitWidth";
  }
  if (fit === "page") {
    return "fitPage";
  }
  return level === 1 ? "actualSize" : "custom";
}
