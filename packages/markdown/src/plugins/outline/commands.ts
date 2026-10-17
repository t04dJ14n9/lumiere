import { contributionId } from "../../shared/setting-schema";

export const VIEW_ID = contributionId("outline");
export const OPEN_COMMAND = `${VIEW_ID}.open`;
export const EXPAND_ALL_COMMAND = `${VIEW_ID}.expandAll`;
export const ENABLE_FOLLOW_COMMAND = `${VIEW_ID}.enableFollowCursor`;
export const DISABLE_FOLLOW_COMMAND = `${VIEW_ID}.disableFollowCursor`;
export const TOGGLE_COMMAND = `${VIEW_ID}.toggle`;
export const GO_TO_HEADING_COMMAND = `${VIEW_ID}.goToHeading`;
export const COMMANDS_CONTEXT = "markdownWorkshop.plugin.outline";
export const FOLLOW_CURSOR_CONTEXT = `${VIEW_ID}.followCursor`;
export const FOLLOW_CURSOR_SETTING = "outline.followCursor";
