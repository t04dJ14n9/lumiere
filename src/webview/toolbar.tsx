import { ZoomMode, useZoom } from '@embedpdf/plugin-zoom/react';
import React from 'react';
import type { Navigation } from './navigation';
import { NumberField } from './number-field';
import { DOCUMENT_ID, ZOOM_RANGE } from './plugins';

/** Page navigation, zoom and search. */
export function Toolbar({ navigation, onSearch }: { navigation: Navigation; onSearch: () => void }): React.JSX.Element {
  const { provides: zoom, state } = useZoom(DOCUMENT_ID);
  const { currentPage, pageCount } = navigation;
  return (
    <div className="toolbar" role="toolbar" aria-label="PDF toolbar">
      <button type="button" aria-label="Previous page" title="Previous page" disabled={currentPage <= 1} onClick={() => navigation.step(-1)}>‹</button>
      <NumberField
        label="Page"
        value={currentPage}
        suffix={`of ${pageCount}`}
        onCommit={page => {
          if (!Number.isInteger(page)) return false;
          const target = Math.min(Math.max(1, page), pageCount);
          navigation.goToPage(target);
          return target;
        }}
      />
      <button type="button" aria-label="Next page" title="Next page" disabled={currentPage >= pageCount} onClick={() => navigation.step(1)}>›</button>
      <span className="separator" />
      <button type="button" aria-label="Zoom out" title="Zoom out" onClick={() => zoom?.zoomOut()}>−</button>
      <NumberField
        label="Zoom"
        value={Math.round(state.currentZoomLevel * 100)}
        suffix="%"
        onCommit={percent => {
          const level = Math.min(ZOOM_RANGE.max, Math.max(ZOOM_RANGE.min, percent / 100));
          zoom?.requestZoom(level);
          return Math.round(level * 100);
        }}
      />
      <button type="button" aria-label="Zoom in" title="Zoom in" onClick={() => zoom?.zoomIn()}>+</button>
      <button type="button" aria-label="Fit width" title="Fit width" onClick={() => zoom?.requestZoom(ZoomMode.FitWidth)}>↔</button>
      <button type="button" aria-label="Fit page" title="Fit page" onClick={() => zoom?.requestZoom(ZoomMode.FitPage)}>⤢</button>
      <span className="spacer" />
      <button type="button" aria-label="Find in PDF" title="Find (⌘F / Ctrl+F)" onClick={onSearch}>⌕</button>
    </div>
  );
}
