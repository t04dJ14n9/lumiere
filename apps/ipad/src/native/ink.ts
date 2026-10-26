/**
 * The iPad's `LumiereInk` plugin (InkPlugin.swift) as the `ink` host
 * service: a PencilKit canvas over the window. Drawings cross the bridge as
 * a sketch file's metadata JSON, so the bridge and the file share one
 * format, and come back checked like any file.
 */
import { registerPlugin } from "@capacitor/core";
import {
  decodeSketch,
  emptySketch,
  encodeSketch,
  withPencilKit,
} from "@workshop/ink/format";
import type { InkService } from "@workshop/ink/service";

export interface InkBridge {
  capabilities(): Promise<{
    engine: string;
    pressure: boolean;
    toolPicker: boolean;
  }>;
  /** `sketch` is `encodeSketch`'s JSON; so is the answer's. */
  draw(options: { title: string; sketch: string }): Promise<{
    sketch?: string;
    /** PencilKit's own data for the drawing, base64. */
    pencilKit?: string;
    cancelled?: boolean;
  }>;
}

export function inkService(bridge: InkBridge): InkService {
  return {
    capabilities: () => bridge.capabilities(),
    async draw(request) {
      const answer = await bridge.draw({
        title: request.title,
        sketch: encodeSketch(request.sketch ?? emptySketch()),
      });
      if (answer.cancelled || answer.sketch === undefined) {
        return undefined;
      }
      const sketch = decodeSketch(answer.sketch);
      // Kept with the fingerprint of these strokes, as they are rounded in the file.
      return answer.pencilKit
        ? withPencilKit(sketch, answer.pencilKit)
        : sketch;
    },
  };
}

export const nativeInk = inkService(registerPlugin<InkBridge>("LumiereInk"));
