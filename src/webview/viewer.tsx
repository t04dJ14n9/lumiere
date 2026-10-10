import type { PdfDocumentObject } from "@embedpdf/models";
import { Scroller } from "@embedpdf/plugin-scroll/react";
import { CopyToClipboard } from "@embedpdf/plugin-selection/react";
import { Viewport } from "@embedpdf/plugin-viewport/react";
import { ZoomGestureWrapper } from "@embedpdf/plugin-zoom/react";
import React, { useEffect, useRef, useState } from "react";
import { parseViewerAction } from "../shared/view-state";
import { useEndDragsReleasedOutside } from "./drag-release";
import { listenToHost } from "./host";
import { useNavigation } from "./navigation";
import { useOutlinePublishing } from "./outline";
import { Page } from "./page";
import { PageBitmaps } from "./page-bitmaps";
import { DOCUMENT_ID } from "./plugins";
import {
  currentViewSettings,
  rememberViewSettings,
  rememberedPosition,
  useRestorePosition,
} from "./reading-position";
import type { ViewChoices } from "../shared/view-settings";
import { usePagedScroll } from "./paged-scroll";
import { usePagedWheel, usePagingKeys } from "./paging-input";
import { useSmoothMotion, useSmoothWheel } from "./smooth-scrolling";
import { useZoomScrollSettle } from "./zoom-scroll";
import { zenToolbarMode } from "../shared/zen";
import { useZen } from "./zen";
import { useZoomTransition } from "./zoom-transition";
import { useViewLayout } from "./view-layout";
import { PagedPadding } from "./paged-padding";
import { SearchBar } from "./search-bar";
import { useIgnoreSecondaryButtons } from "./secondary-buttons";
import { useLookUp } from "./look-up";
import { useSelectionReporting } from "./selection";
import { useToolMode } from "./tool-mode";
import {
  currentToolbarSettings,
  rememberToolbarSettings,
} from "./toolbar-settings";
import { FloatingToolbar } from "./floating-toolbar";
import { Toolbar } from "./toolbar";
import { useViewActions, useViewReporting } from "./view-sync";
import { useWheelZoom } from "./wheel-zoom";

/**
 * The open PDF: the slim or floating bar (unless the controls are in VS
 * Code's own UI or hidden), an optional search bar, and the scrolling pages.
 */
export function Viewer({
  document: pdf,
}: {
  document: PdfDocumentObject;
}): React.JSX.Element {
  const [choices, setChoices] = useState<ViewChoices>(() => {
    const position = rememberedPosition();
    return {
      pageLayout: position.pageLayout,
      scrollMode: position.scrollMode,
      scrollDirection: position.scrollDirection,
    };
  });
  const [motionSetting, setMotionSetting] = useState(
    () => currentViewSettings().smoothScrolling,
  );
  const smooth = useSmoothMotion(motionSetting);
  const navigation = useNavigation(DOCUMENT_ID, choices.scrollMode, smooth);
  const selection = useSelectionReporting(DOCUMENT_ID, pdf);
  const devicePixelRatio = useDevicePixelRatio();
  const [searching, setSearching] = useState(false);
  /** Counts Find requests, so Find on an open search bar focuses it again. */
  const [findRequest, setFindRequest] = useState(0);
  const openSearch = (): void => {
    setSearching(true);
    setFindRequest((request) => request + 1);
  };
  useOutlinePublishing(DOCUMENT_ID, pdf);
  const documentArea = useRef<HTMLDivElement>(null);
  useWheelZoom(documentArea);
  const bounds = usePagedScroll(
    documentArea,
    navigation.currentPage,
    choices.scrollMode,
  );
  useSmoothWheel(documentArea, smooth, choices.scrollDirection, bounds);
  const paging = {
    mode: choices.scrollMode,
    direction: choices.scrollDirection,
    bounds,
    step: navigation.step,
  };
  const [lookUp, setLookUp] = useState(false);
  useLookUp(pdf, lookUp);
  usePagingKeys(documentArea, paging);
  usePagedWheel(documentArea, paging);
  useZoomTransition(documentArea, smooth);
  useZoomScrollSettle(documentArea);
  useViewLayout(choices, navigation);
  useEndDragsReleasedOutside();
  useIgnoreSecondaryButtons(documentArea);

  const show = navigation.show;
  useRestorePosition(navigation, pdf.pages.length);

  const [setting, setToolbar] = useState(currentToolbarSettings);
  const [zen, setZen] = useZen();
  const toolbar = { ...setting, mode: zenToolbarMode(setting.mode, zen) };
  const { tool, setTool } = useToolMode(DOCUMENT_ID);
  useViewReporting(navigation, tool, choices);
  const runAction = useViewActions(navigation, openSearch, setTool, (next) =>
    setChoices((current) => ({ ...current, ...next })),
  );
  useEffect(
    () =>
      listenToHost((message) => {
        if (message.type === "goTo") show(message.location, message.top);
        else if (message.type === "action") {
          const action = parseViewerAction(message.action);
          if (action) runAction(action);
        } else if (message.type === "viewSettings") {
          const previous = currentViewSettings();
          const settings = rememberViewSettings(message.settings);
          setMotionSetting(settings.smoothScrolling);
          if (settings.pageLayout !== previous.pageLayout)
            setChoices((current) => ({
              ...current,
              pageLayout: settings.pageLayout,
            }));
        } else if (message.type === "lookUp") {
          setLookUp(message.enabled);
        } else if (message.type === "zen") {
          setZen(message.on);
        } else if (message.type === "toolbar") {
          setToolbar(rememberToolbarSettings(message.toolbar));
        }
      }),
    [show, runAction, setZen],
  );

  const latest = useRef({ selection, searching, tool, setTool });
  latest.current = { selection, searching, tool, setTool };
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "f") {
        event.preventDefault();
        setSearching(true);
        setFindRequest((request) => request + 1);
      } else if (event.key === "Escape") {
        const { searching, selection, tool, setTool } = latest.current;
        if (document.querySelector(".view-menu:popover-open")) return;
        if (searching) setSearching(false);
        // With nothing selected, Escape puts down the Select Region tool.
        else if (tool === "region" && !selection.region) setTool("text");
        else selection.clear();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <div
      className={`viewer tool-${tool} toolbar-${toolbar.mode}${smooth ? " smooth-motion" : ""}`}
      data-smooth-scrolling={smooth}
      data-scroll-mode={choices.scrollMode}
      data-page-layout={choices.pageLayout}
      data-scroll-direction={choices.scrollDirection}
    >
      <CopyToClipboard />
      {toolbar.mode === "slim" && (
        <Toolbar
          navigation={navigation}
          tool={tool}
          choices={choices}
          run={runAction}
        />
      )}
      <div className="document" ref={documentArea}>
        {toolbar.mode === "floating" && (
          <FloatingToolbar
            navigation={navigation}
            tool={tool}
            choices={choices}
            run={runAction}
            dock={toolbar.dock}
            onDock={(dock) =>
              setToolbar((current) =>
                rememberToolbarSettings({ ...current, dock }),
              )
            }
            zen={zen}
          />
        )}
        {searching && (
          <SearchBar
            navigation={navigation}
            focusRequest={findRequest}
            onClose={() => setSearching(false)}
          />
        )}
        <PageBitmaps pdf={pdf} scroller={documentArea}>
        <Viewport
          documentId={DOCUMENT_ID}
          className={`viewport${choices.scrollMode === "paged" ? " paged" : ""}`}
          tabIndex={0}
          style={{ display: "flex" }}
        >
          <ZoomGestureWrapper
            documentId={DOCUMENT_ID}
            enableWheel={false}
            style={{ position: "relative", margin: "auto" }}
          >
            <Scroller
              documentId={DOCUMENT_ID}
              data-pdf-scroller
              renderPage={({ pageIndex, width, height }) =>
                navigation.activePages &&
                !navigation.activePages.includes(pageIndex + 1) ? null : (
                  <div
                    className={
                      choices.scrollMode === "paged" ? "paged-page" : undefined
                    }
                  >
                    <Page
                      pdf={pdf}
                      pageIndex={pageIndex}
                      width={width}
                      height={height}
                      devicePixelRatio={devicePixelRatio}
                      highlight={navigation.highlight}
                      region={selection.region}
                      selection={selection}
                      onOpenPage={(page, top) => navigation.goToPage(page, top)}
                    />
                  </div>
                )
              }
            />
            {choices.scrollMode === "paged" && (
              <PagedPadding direction={choices.scrollDirection} />
            )}
          </ZoomGestureWrapper>
        </Viewport>
        </PageBitmaps>
      </div>
    </div>
  );
}

/** The screen's pixel ratio, updated when the window moves to another display. */
function useDevicePixelRatio(): number {
  const [ratio, setRatio] = useState(() => window.devicePixelRatio || 1);
  useEffect(() => {
    const query = window.matchMedia(`(resolution: ${ratio}dppx)`);
    const update = (): void => setRatio(window.devicePixelRatio || 1);
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, [ratio]);
  return ratio;
}
