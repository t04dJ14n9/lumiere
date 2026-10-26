import { defineManifest } from "../../shared/manifest";

/**
 * True while the host half runs, which needs a canvas (the `ink` service):
 * Insert Sketch shows only where it can draw.
 */
export const CAN_DRAW = "lumiere.markdown.sketch.canDraw";

export default defineManifest({
  id: "sketch",
  title: "Sketches",
  description:
    "Draw with Apple Pencil in a note: insert a sketch, and tap one to edit it.",
  kind: "feature",
  defaultEnabled: true,
  surfaces: ["host", "webview"],
  capabilities: ["rendering", "commands", "fileWrites"],
  contributes: {
    commands: [{ id: "insertSketch", title: "Insert Sketch", when: CAN_DRAW }],
    menus: [
      {
        command: "insertSketch",
        location: "webview/context",
        when: `webviewSection == 'markdownContent' && ${CAN_DRAW}`,
        group: "sketch@1",
      },
    ],
  },
});
