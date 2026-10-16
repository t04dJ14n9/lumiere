/**
 * Command ids passed to `vscode.commands.registerCommand`.
 * Each registration site imports from here. `contributes.commands` must
 * list the same ids (`RUNTIME_COMMAND_IDS`).
 */

export const VIEW_COMMAND_IDS = {
  previousPage: "pdfWorkshop.previousPage",
  nextPage: "pdfWorkshop.nextPage",
  previousPageKeepingPlace: "pdfWorkshop.previousPageKeepingPlace",
  nextPageKeepingPlace: "pdfWorkshop.nextPageKeepingPlace",
  zoomIn: "pdfWorkshop.zoomIn",
  zoomOut: "pdfWorkshop.zoomOut",
  fitWidth: "pdfWorkshop.fitWidth",
  fitPage: "pdfWorkshop.fitPage",
  find: "pdfWorkshop.find",
  selectTextTool: "pdfWorkshop.selectTextTool",
  selectRegionTool: "pdfWorkshop.selectRegionTool",
  goToPage: "pdfWorkshop.goToPage",
  selectZoom: "pdfWorkshop.selectZoom",
} as const;

/** Layout, scrolling and the View picker. Suffixes in `view-options.ts` stay short; the full id is only this map. */
export const VIEW_CONTROL_COMMAND_IDS = {
  actualSize: "pdfWorkshop.actualSize",
  singlePage: "pdfWorkshop.singlePage",
  twoPageSpread: "pdfWorkshop.twoPageSpread",
  twoPageCover: "pdfWorkshop.twoPageCover",
  continuousScroll: "pdfWorkshop.continuousScroll",
  pageByPage: "pdfWorkshop.pageByPage",
  verticalScroll: "pdfWorkshop.verticalScroll",
  horizontalScroll: "pdfWorkshop.horizontalScroll",
  selectView: "pdfWorkshop.selectView",
} as const;

export const OPEN_NATIVE_LINK_COMMAND_ID = "pdfWorkshop.openNativeLink";
export const OPEN_LOCATION_COMMAND_ID = "pdfWorkshop.openLocation";

export const SETTINGS_COMMAND_IDS = {
  openSettings: "pdfWorkshop.openSettings",
  changeSetting: "pdfWorkshop.changeSetting",
  toggleSmoothScrolling: "pdfWorkshop.toggleSmoothScrolling",
  toggleKeyboardShortcuts: "pdfWorkshop.toggleKeyboardShortcuts",
  setDefaultZoom: "pdfWorkshop.setDefaultZoom",
  setDefaultPageLayout: "pdfWorkshop.setDefaultPageLayout",
  setDefaultScrollMode: "pdfWorkshop.setDefaultScrollMode",
} as const;

export const ZEN_COMMAND_IDS = {
  enterZen: "pdfWorkshop.enterZen",
  exitZen: "pdfWorkshop.exitZen",
} as const;

export const HISTORY_COMMAND_IDS = {
  historyBack: "pdfWorkshop.historyBack",
  historyForward: "pdfWorkshop.historyForward",
} as const;

export const TOOLBAR_COMMAND_IDS = {
  selectToolbarMode: "pdfWorkshop.selectToolbarMode",
} as const;

export const LOOK_UP_COMMAND_IDS = {
  lookUp: "pdfWorkshop.lookUp",
} as const;

export const OUTLINE_COMMAND_IDS = {
  expandOutline: "pdfWorkshop.expandOutline",
  enableOutlineFollowCursor: "pdfWorkshop.enableOutlineFollowCursor",
  disableOutlineFollowCursor: "pdfWorkshop.disableOutlineFollowCursor",
  toggleOutline: "pdfWorkshop.toggleOutline",
  goToOutlineItem: "pdfWorkshop.goToOutlineItem",
} as const;

export const IDE_CONTEXT_COMMAND_IDS = {
  copy: "pdfWorkshop.ideContext.copy",
  send: "pdfWorkshop.ideContext.send",
} as const;

export const AGENT_BRIDGE_COMMAND_IDS = {
  copyLinkForAgent: "pdfWorkshop.copyLinkForAgent",
  copyMcpSetup: "pdfWorkshop.copyMcpSetup",
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
  const id = (VIEW_CONTROL_COMMAND_IDS as Readonly<Record<string, string>>)[suffix];
  if (id === undefined) throw new Error(`Unknown view control command: ${suffix}`);
  return id;
}
