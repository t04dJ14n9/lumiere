/**
 * The commands that only ask the active viewer to do something: page,
 * zoom, fit, find, pick a tool, change the layout or scrolling. Every host
 * registers these the same way; commands that ask the reader first (Go to
 * Page, the zoom and View pickers) are registered on their own.
 */
import {
  VIEW_COMMAND_IDS,
  VIEW_CONTROL_COMMAND_IDS,
  viewControlCommandId,
} from "./command-ids";
import { PAGE_LAYOUTS, SCROLL_DIRECTIONS, SCROLL_MODES } from "./view-options";
import type { ViewerAction } from "./view-state";

export interface ViewActionCommand {
  readonly id: string;
  readonly action: ViewerAction;
}

/** What an action that takes an argument carries besides its name. */
type ActionArgument =
  | { page: unknown }
  | { percent: unknown }
  | { tool: unknown }
  | { pageLayout: unknown }
  | { scrollMode: unknown }
  | { scrollDirection: unknown };

/** The actions that take no argument. */
type SimpleAction = Exclude<ViewerAction, ActionArgument>["action"];

const simple = (id: string, action: SimpleAction): ViewActionCommand => ({
  id,
  action: { action },
});

/** Each command and the viewer action it sends, in registration order. */
export const VIEW_ACTION_COMMANDS: readonly ViewActionCommand[] = [
  simple(VIEW_COMMAND_IDS.previousPage, "previousPage"),
  simple(VIEW_COMMAND_IDS.nextPage, "nextPage"),
  simple(VIEW_COMMAND_IDS.previousPageKeepingPlace, "previousPageKeepingPlace"),
  simple(VIEW_COMMAND_IDS.nextPageKeepingPlace, "nextPageKeepingPlace"),
  simple(VIEW_COMMAND_IDS.zoomIn, "zoomIn"),
  simple(VIEW_COMMAND_IDS.zoomOut, "zoomOut"),
  simple(VIEW_COMMAND_IDS.fitWidth, "fitWidth"),
  simple(VIEW_COMMAND_IDS.fitPage, "fitPage"),
  simple(VIEW_COMMAND_IDS.find, "find"),
  {
    id: VIEW_COMMAND_IDS.selectTextTool,
    action: { action: "setTool", tool: "text" },
  },
  {
    id: VIEW_COMMAND_IDS.selectRegionTool,
    action: { action: "setTool", tool: "region" },
  },
  {
    id: VIEW_COMMAND_IDS.selectAnnotateTool,
    action: { action: "setTool", tool: "annotate" },
  },
  simple(VIEW_COMMAND_IDS.annotationUndo, "annotationUndo"),
  simple(VIEW_COMMAND_IDS.annotationRedo, "annotationRedo"),
  simple(VIEW_CONTROL_COMMAND_IDS.actualSize, "actualSize"),
  ...PAGE_LAYOUTS.map((item) => ({
    id: viewControlCommandId(item.command),
    action: { action: "setPageLayout", pageLayout: item.value } as const,
  })),
  ...SCROLL_MODES.map((item) => ({
    id: viewControlCommandId(item.command),
    action: { action: "setScrollMode", scrollMode: item.value } as const,
  })),
  ...SCROLL_DIRECTIONS.map((item) => ({
    id: viewControlCommandId(item.command),
    action: {
      action: "setScrollDirection",
      scrollDirection: item.value,
    } as const,
  })),
];
