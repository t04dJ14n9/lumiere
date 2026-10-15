import type { Plugin } from "../../kernel";

/** Host-only plugin: no CodeMirror half. */
export const cursorBridgeWebview: Plugin = {
  name: "cursorBridge",
  apply() {},
};
