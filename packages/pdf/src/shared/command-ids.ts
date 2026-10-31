import { PDF_BRIDGE_ENVELOPE_COMMAND } from "./bridge-envelope";

/**
 * Command ids passed to `vscode.commands.registerCommand`.
 * Each registration site imports from here. `contributes.commands` must
 * list the same ids (`RUNTIME_COMMAND_IDS`).
 */

export const VIEW_COMMAND_IDS = {
  previousPage: "lumiere.pdf.previousPage",
  nextPage: "lumiere.pdf.nextPage",
  previousPageKeepingPlace: "lumiere.pdf.previousPageKeepingPlace",
  nextPageKeepingPlace: "lumiere.pdf.nextPageKeepingPlace",
  zoomIn: "lumiere.pdf.zoomIn",
  zoomOut: "lumiere.pdf.zoomOut",
  fitWidth: "lumiere.pdf.fitWidth",
  fitPage: "lumiere.pdf.fitPage",
  find: "lumiere.pdf.find",
  selectTextTool: "lumiere.pdf.selectTextTool",
  selectRegionTool: "lumiere.pdf.selectRegionTool",
  selectAnnotateTool: "lumiere.pdf.selectAnnotateTool",
  toggleAnnotateTool: "lumiere.pdf.toggleAnnotateTool",
  pickAnnotationTool: "lumiere.pdf.pickAnnotationTool",
  pickAnnotationColor: "lumiere.pdf.pickAnnotationColor",
  annotationUndo: "lumiere.pdf.annotationUndo",
  annotationRedo: "lumiere.pdf.annotationRedo",
  annotationRetrySave: "lumiere.pdf.annotationRetrySave",
  deleteAnnotation: "lumiere.pdf.deleteAnnotation",
  goToPage: "lumiere.pdf.goToPage",
  selectZoom: "lumiere.pdf.selectZoom",
} as const;

/** Layout, scrolling and the View picker. Suffixes in `view-options.ts` stay short; the full id is only this map. */
export const VIEW_CONTROL_COMMAND_IDS = {
  actualSize: "lumiere.pdf.actualSize",
  singlePage: "lumiere.pdf.singlePage",
  twoPageSpread: "lumiere.pdf.twoPageSpread",
  twoPageCover: "lumiere.pdf.twoPageCover",
  continuousScroll: "lumiere.pdf.continuousScroll",
  pageByPage: "lumiere.pdf.pageByPage",
  verticalScroll: "lumiere.pdf.verticalScroll",
  horizontalScroll: "lumiere.pdf.horizontalScroll",
  selectView: "lumiere.pdf.selectView",
} as const;

export const OPEN_NATIVE_LINK_COMMAND_ID = "lumiere.pdf.openNativeLink";
export const OPEN_LOCATION_COMMAND_ID = "lumiere.pdf.openLocation";

export const SETTINGS_COMMAND_IDS = {
  openSettings: "lumiere.pdf.openSettings",
  changeSetting: "lumiere.pdf.changeSetting",
  toggleSmoothScrolling: "lumiere.pdf.toggleSmoothScrolling",
  toggleKeyboardShortcuts: "lumiere.pdf.toggleKeyboardShortcuts",
  setDefaultZoom: "lumiere.pdf.setDefaultZoom",
  setDefaultPageLayout: "lumiere.pdf.setDefaultPageLayout",
  setDefaultScrollMode: "lumiere.pdf.setDefaultScrollMode",
} as const;

export const ZEN_COMMAND_IDS = {
  enterZen: "lumiere.pdf.enterZen",
  exitZen: "lumiere.pdf.exitZen",
} as const;

export const HISTORY_COMMAND_IDS = {
  historyBack: "lumiere.pdf.historyBack",
  historyForward: "lumiere.pdf.historyForward",
} as const;

export const TOOLBAR_COMMAND_IDS = {
  selectToolbarMode: "lumiere.pdf.selectToolbarMode",
  cyclePageColors: "lumiere.pdf.cyclePageColors",
} as const;

export const LOOK_UP_COMMAND_IDS = {
  lookUp: "lumiere.pdf.lookUp",
} as const;

export const OUTLINE_COMMAND_IDS = {
  expandOutline: "lumiere.pdf.expandOutline",
  enableOutlineFollowCursor: "lumiere.pdf.enableOutlineFollowCursor",
  disableOutlineFollowCursor: "lumiere.pdf.disableOutlineFollowCursor",
  toggleOutline: "lumiere.pdf.toggleOutline",
  goToOutlineItem: "lumiere.pdf.goToOutlineItem",
} as const;

export const IDE_CONTEXT_COMMAND_IDS = {
  copy: "lumiere.pdf.ideContext.copy",
  send: "lumiere.pdf.ideContext.send",
} as const;

export const AGENT_BRIDGE_COMMAND_IDS = {
  copyLinkForAgent: "lumiere.pdf.copyLinkForAgent",
  copyMcpSetup: "lumiere.pdf.copyMcpSetup",
  envelope: PDF_BRIDGE_ENVELOPE_COMMAND,
} as const;

export const RUNTIME_COMMAND_IDS: readonly string[] = [
  ...Object.values(VIEW_COMMAND_IDS),
  ...Object.values(VIEW_CONTROL_COMMAND_IDS),
  OPEN_NATIVE_LINK_COMMAND_ID,
  OPEN_LOCATION_COMMAND_ID,
  ...Object.values(SETTINGS_COMMAND_IDS),
  ...Object.values(ZEN_COMMAND_IDS),
  ...Object.values(HISTORY_COMMAND_IDS),
  ...Object.values(TOOLBAR_COMMAND_IDS),
  ...Object.values(LOOK_UP_COMMAND_IDS),
  ...Object.values(OUTLINE_COMMAND_IDS),
  ...Object.values(AGENT_BRIDGE_COMMAND_IDS),
  ...Object.values(IDE_CONTEXT_COMMAND_IDS),
];

/** Full id for a view-options suffix (`singlePage`, …). Unknown suffixes are not registered. */
export function viewControlCommandId(suffix: string): string {
  const id = (VIEW_CONTROL_COMMAND_IDS as Readonly<Record<string, string>>)[
    suffix
  ];
  if (id === undefined) {
    throw new Error(`Unknown view control command: ${suffix}`);
  }
  return id;
}
