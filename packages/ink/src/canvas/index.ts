/**
 * The `ink` host service in a browser (`@workshop/ink/canvas`): a canvas
 * over the whole window, drawn on with Pointer Events. A pen tablet draws
 * with its pressure and tilt; a mouse or trackpad with a line that thins
 * as it speeds up. The desktop app's window and the web app provide it;
 * the iPad has PencilKit instead (docs/IPAD_PLAN.md section 5).
 */
import type { InkService } from "../service/ink";
import { openSketchCanvas } from "./sketch-canvas";

export interface WebInkOptions {
  /** Where the canvas goes while it is open; the document's body if not given. */
  readonly parent?: () => HTMLElement;
}

export function webInk(options: WebInkOptions = {}): InkService {
  let isOpen = false;
  return {
    capabilities: async () => ({
      engine: "web",
      // Pointer Events carry a pen tablet's pressure; whether one is
      // plugged in is known only once it touches the canvas.
      pressure: true,
      toolPicker: false,
    }),
    async draw(request) {
      if (isOpen) {
        throw new Error("A sketch is already open.");
      }
      isOpen = true;
      try {
        return await openSketchCanvas(
          request,
          options.parent?.() ?? document.body,
        );
      } finally {
        isOpen = false;
      }
    },
  };
}
