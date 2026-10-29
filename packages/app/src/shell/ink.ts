/**
 * Drawing for a Lumière server: its plugins run there and ask for a
 * sketch (src/server/ink.ts); the window draws it on the web canvas
 * (`@workshop/ink/canvas`) and posts it back. A drawing already waiting
 * when the window loads (it was reloaded mid-drawing) opens at once.
 *
 * The web and iPad apps have no need of this: their host runs in the
 * window's own page and is handed its canvas directly.
 */
import { decodeSketch, encodeSketch } from "@workshop/ink/format";
import type { InkService } from "@workshop/ink/service";
import type { InkWaiting, ServerEvent } from "./api";

export interface InkServer {
  waiting(): Promise<InkWaiting | undefined>;
  answer(id: string, sketch: string | undefined): Promise<unknown>;
  events(listener: (event: ServerEvent) => void): () => void;
}

export interface DrawForServerOptions {
  readonly server: InkServer;
  readonly canvas: InkService;
  readonly warn: (message: string, error: unknown) => void;
}

/** Draw what the server asks for until stopped; returns the stop. */
export function drawForServer(options: DrawForServerOptions): () => void {
  let drawing: string | undefined;
  const draw = async () => {
    const waiting = await options.server.waiting();
    if (!waiting || waiting.id === drawing) {
      return;
    }
    drawing = waiting.id;
    try {
      const sketch = await options.canvas.draw({
        title: waiting.title,
        sketch: decodeSketch(waiting.sketch),
      });
      await options.server.answer(waiting.id, sketch && encodeSketch(sketch));
    } catch (error) {
      // The canvas could not open: the server's plugin stops waiting.
      await options.server.answer(waiting.id, undefined).catch(() => {});
      throw error;
    } finally {
      drawing = undefined;
    }
  };
  const drawReporting = () => {
    draw().catch((error: unknown) => options.warn("Could not draw", error));
  };
  const stop = options.server.events((event) => {
    if (event.type === "ink") {
      drawReporting();
    }
  });
  drawReporting();
  return stop;
}
