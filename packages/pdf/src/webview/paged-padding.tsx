import { useZoom } from "@embedpdf/plugin-zoom/react";
import React from "react";
import type { ScrollDirection } from "../shared/view-settings";
import { DOCUMENT_ID } from "./plugins";
import { useScrollState } from "./scroll-state";

/** Native end padding lets the last small page/spread reach the same position as the others. */
export function PagedPadding({
  direction,
}: {
  direction: ScrollDirection;
}): React.JSX.Element {
  const { state } = useScrollState();
  const { state: zoom } = useZoom(DOCUMENT_ID);
  const horizontal = direction === "horizontal";
  return (
    <div
      aria-hidden
      style={{
        position: "absolute",
        pointerEvents: "none",
        left: horizontal
          ? state.totalContentSize.width * zoom.currentZoomLevel
          : 0,
        top: horizontal
          ? 0
          : state.totalContentSize.height * zoom.currentZoomLevel,
        width: horizontal ? "100vw" : 1,
        height: horizontal ? 1 : "100vh",
      }}
    />
  );
}
