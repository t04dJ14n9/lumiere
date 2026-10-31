import type { PdfDocumentObject } from "@embedpdf/models";
import { Scroller } from "@embedpdf/plugin-scroll/react";
import { CopyToClipboard } from "@embedpdf/plugin-selection/react";
import { Viewport } from "@embedpdf/plugin-viewport/react";
import { ZoomGestureWrapper } from "@embedpdf/plugin-zoom/react";
import React, { useEffect, useRef, useState } from "react";
import { useEndDragsReleasedOutside } from "./drag-release";
import { useNavigation, type Navigation } from "./navigation";
import { useOutlinePublishing } from "./outline";
import { Page } from "./page";
import { PageBitmaps } from "./page-bitmaps";
import { DOCUMENT_ID } from "./plugins";
import {
  currentViewSettings,
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
import { isEditableTarget } from "./editable-target";
import { useSelectionReporting } from "./selection";
import { useAnnotationMode } from "./annotation-mode";
import { useAnnotationSaveSession } from "./annotation-session";
import { useAnnotationSelection } from "./annotation-selection";
import { shouldDeleteAnnotationOnKey } from "../shared/annotation-delete-keys";
import { useToolMode } from "./tool-mode";
import { currentToolbarSettings } from "./toolbar-settings";
import { rememberPageColors } from "./page-colors";
import { Toolbar } from "./toolbar";
import { useViewActions, useViewReporting } from "./view-sync";
import { useHostMessages } from "./host-messages";
import { useWheelZoom } from "./wheel-zoom";
import { useJumpHistory } from "./jump-history";

/**
 * The open PDF: an optional search bar and the scrolling pages. Controls
 * live on the VS Code status bar (or commands when toolbar.mode is none).
 */
export function Viewer({
  document: pdf,
}: {
  document: PdfDocumentObject;
}): React.JSX.Element {
  const view = useViewerState(pdf);
  const { choices, smooth, toolbar, tool, navigation, history, search } = view;
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
          run={view.runAction}
          history={history}
        />
      )}
      <div className="document" ref={view.documentArea}>
        {search.isOpen && (
          <SearchBar
            navigation={navigation}
            focusRequest={search.focusRequest}
            onPreviewEnd={history.endPreview}
            onClose={search.close}
          />
        )}
        <DocumentPages
          pdf={pdf}
          scroller={view.documentArea}
          choices={choices}
          navigation={navigation}
          selection={view.selection}
          annotate={tool === "annotate"}
        />
      </div>
    </div>
  );
}

/** Everything the viewer tracks and listens to, for one open PDF. */
function useViewerState(pdf: PdfDocumentObject) {
  const [choices, setChoices] = useState<ViewChoices>(rememberedChoices);
  const [motionSetting, setMotionSetting] = useState(
    () => currentViewSettings().smoothScrolling,
  );
  const smooth = useSmoothMotion(motionSetting);
  const rawNavigation = useNavigation(DOCUMENT_ID, choices.scrollMode, smooth);
  const history = useJumpHistory(rawNavigation, choices, setChoices);
  const navigation = withHistory(rawNavigation, history);
  const search = useSearch();
  useOutlinePublishing(DOCUMENT_ID, pdf);
  const documentArea = useRef<HTMLDivElement>(null);
  useDocumentInput(documentArea, { choices, navigation, smooth });
  const [lookUp, setLookUp] = useState(false);
  const requestLookUp = useLookUp(pdf, lookUp);
  useRestorePosition(navigation, pdf.pages.length);
  const [setting, setToolbar] = useState(currentToolbarSettings);
  const [zen, setZen] = useZen();
  const tools = useViewerTools(pdf, {
    navigation,
    search,
    choices,
    setChoices,
  });
  useHostMessages({
    show: navigation.show,
    history,
    runAction: tools.runAction,
    requestLookUp,
    reportSelection: tools.selection.reportNow,
    setLookUp,
    setZen,
    setToolbar,
    setMotionSetting,
    setChoices,
    setPageColors: rememberPageColors,
    retryAnnotationSave: tools.annotationSave.retry,
  });
  return {
    choices,
    smooth,
    navigation,
    history,
    selection: tools.selection,
    search,
    documentArea,
    tool: tools.tool,
    annotation: tools.annotation,
    annotationSelection: tools.annotationSelection,
    runAction: tools.runAction,
    zen,
    toolbar: { ...setting, mode: zenToolbarMode(setting.mode, zen) },
  };
}

type ViewerToolsDeps = {
  navigation: ReturnType<typeof withHistory>;
  search: ReturnType<typeof useSearch>;
  choices: ViewChoices;
  setChoices: React.Dispatch<React.SetStateAction<ViewChoices>>;
};

/** Tool mode, annotations, selection reporting, view actions and keys. */
function useViewerTools(pdf: PdfDocumentObject, deps: ViewerToolsDeps) {
  const { navigation, search, choices, setChoices } = deps;
  const { tool, setTool } = useToolMode(DOCUMENT_ID);
  const annotation = useAnnotationMode(DOCUMENT_ID);
  const annotationSave = useAnnotationSaveSession(pdf);
  const annotationSelected = useRef(false);
  const selection = useSelectionReporting(DOCUMENT_ID, pdf, () =>
    Boolean(annotationSelected.current),
  );
  const annotationSelection = useAnnotationSelection(
    DOCUMENT_ID,
    pdf,
    tool === "annotate",
    selection.setAnnotationRegion,
  );
  annotationSelected.current = annotationSelection.hasAnnotationSelection;
  useViewReporting(navigation, tool, choices, annotation);
  const runAction = useViewActions(navigation, search.open, setTool, {
    setChoices: (next) => setChoices((current) => ({ ...current, ...next })),
    setAnnotationTool: annotation.setAnnotationTool,
    setColor: annotation.setColor,
    undo: annotation.undo,
    redo: annotation.redo,
    deleteSelectedAnnotations: annotationSelection.deleteSelected,
  });
  useViewerKeys({
    selection,
    search,
    tool,
    setTool,
    hasAnnotationSelection: annotationSelection.hasAnnotationSelection,
    deleteSelectedAnnotations: annotationSelection.deleteSelected,
  });
  return {
    tool,
    annotation,
    annotationSave,
    annotationSelection,
    selection,
    runAction,
  };
}

type JumpHistory = ReturnType<typeof useJumpHistory>;
type Selection = ReturnType<typeof useSelectionReporting>;

/** The remembered page layout and scrolling of this PDF. */
function rememberedChoices(): ViewChoices {
  const position = rememberedPosition();
  return {
    pageLayout: position.pageLayout,
    scrollMode: position.scrollMode,
    scrollDirection: position.scrollDirection,
  };
}

/**
 * Navigation whose page and box moves are history entries: deliberate ones
 * jump, a search's passive reveal is a preview.
 */
function withHistory(navigation: Navigation, history: JumpHistory) {
  return {
    ...navigation,
    goToPage: (page: number, top?: number) =>
      history.jump(() => navigation.goToPage(page, top)),
    reveal: (
      page: number,
      rect: Parameters<Navigation["reveal"]>[1],
      deliberate = true,
    ) => {
      if (deliberate) {
        history.jump(() => navigation.reveal(page, rect), undefined, true);
      } else {
        history.preview(() => navigation.reveal(page, rect));
      }
    },
  };
}

/** The search bar: open, and how many times Find was asked for. */
function useSearch() {
  const [isOpen, setOpen] = useState(false);
  /** Counts Find requests, so Find on an open search bar focuses it again. */
  const [focusRequest, setFocusRequest] = useState(0);
  return {
    isOpen,
    focusRequest,
    open: (): void => {
      setOpen(true);
      setFocusRequest((request) => request + 1);
    },
    close: (): void => setOpen(false),
  };
}

/** Wheel, keys and gestures over the pages, for the current layout. */
function useDocumentInput(
  documentArea: React.RefObject<HTMLDivElement | null>,
  view: {
    choices: ViewChoices;
    navigation: ReturnType<typeof withHistory>;
    smooth: boolean;
  },
): void {
  const { choices, navigation, smooth } = view;
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
  usePagingKeys(documentArea, paging);
  usePagedWheel(documentArea, paging);
  useZoomTransition(documentArea, smooth);
  useZoomScrollSettle(documentArea, navigation.intent);
  useViewLayout(choices, navigation);
  useEndDragsReleasedOutside();
  useIgnoreSecondaryButtons(documentArea);
}

/** Cmd/Ctrl+F opens the search bar; Escape closes it, or drops the tool or selection. */
function useViewerKeys(state: {
  selection: Selection;
  search: ReturnType<typeof useSearch>;
  tool: string;
  setTool: (tool: "text" | "region" | "annotate") => void;
  hasAnnotationSelection: boolean;
  deleteSelectedAnnotations: () => void;
}): void {
  const latest = useRef(state);
  latest.current = state;
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "f") {
        event.preventDefault();
        latest.current.search.open();
      } else if (event.key === "Escape") {
        onEscape(latest.current);
      } else if (
        shouldDeleteAnnotationOnKey({
          key: event.key,
          annotate: latest.current.tool === "annotate",
          hasAnnotationSelection: latest.current.hasAnnotationSelection,
          editable: isEditableTarget(event.target),
        })
      ) {
        event.preventDefault();
        latest.current.deleteSelectedAnnotations();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);
}

function onEscape(state: {
  selection: Selection;
  search: ReturnType<typeof useSearch>;
  tool: string;
  setTool: (tool: "text" | "region" | "annotate") => void;
}): void {
  const { search, selection, tool, setTool } = state;
  if (document.querySelector(".view-menu:popover-open")) {
    return;
  }
  if (search.isOpen) {
    search.close();
  } else if (tool === "annotate") {
    // Spec: Escape exits Annotate mode.
    setTool("text");
  } else if (tool === "region" && !selection.region) {
    // With nothing selected, Escape puts down the Select Region tool.
    setTool("text");
  } else {
    selection.clear();
  }
}

/** The pages, rendered by EmbedPDF inside the viewport, with their bitmaps. */
function DocumentPages({
  pdf,
  scroller,
  choices,
  navigation,
  selection,
  annotate,
}: {
  pdf: PdfDocumentObject;
  scroller: React.RefObject<HTMLDivElement | null>;
  choices: ViewChoices;
  navigation: ReturnType<typeof withHistory>;
  selection: Selection;
  annotate: boolean;
}): React.JSX.Element {
  const devicePixelRatio = useDevicePixelRatio();
  const paged = choices.scrollMode === "paged";
  return (
    <PageBitmaps pdf={pdf} scroller={scroller}>
      <Viewport
        documentId={DOCUMENT_ID}
        className={`viewport${paged ? " paged" : ""}`}
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
                <div className={paged ? "paged-page" : undefined}>
                  <Page
                    pdf={pdf}
                    pageIndex={pageIndex}
                    width={width}
                    height={height}
                    devicePixelRatio={devicePixelRatio}
                    highlight={navigation.highlight}
                    region={selection.region}
                    annotate={annotate}
                    onOpenPage={(page, top) => navigation.goToPage(page, top)}
                  />
                </div>
              )
            }
          />
          {paged && <PagedPadding direction={choices.scrollDirection} />}
        </ZoomGestureWrapper>
      </Viewport>
    </PageBitmaps>
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
