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
  const { state: zoom } = useZoom(DOCUMENT_ID);
  const fit = fitMode(zoom.zoomLevel);
  const mode =
    fit === "width"
      ? "fitWidth"
      : fit === "page"
        ? "fitPage"
        : zoom.currentZoomLevel === 1
          ? "actualSize"
          : "custom";
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
        <label>
          Page layout
          <select
            aria-label="Page layout"
            value={choices.pageLayout}
            onChange={(event) =>
              act({ action: "setPageLayout", pageLayout: event.target.value })
            }
          >
            {PAGE_LAYOUTS.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Scrolling
          <select
            aria-label="Scroll mode"
            value={choices.scrollMode}
            onChange={(event) =>
              act({ action: "setScrollMode", scrollMode: event.target.value })
            }
          >
            {SCROLL_MODES.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Direction
          <select
            aria-label="Scroll direction"
            value={choices.scrollDirection}
            onChange={(event) =>
              act({
                action: "setScrollDirection",
                scrollDirection: event.target.value,
              })
            }
          >
            {SCROLL_DIRECTIONS.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
      </div>
    </span>
  );
}
