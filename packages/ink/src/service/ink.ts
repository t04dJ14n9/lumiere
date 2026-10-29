/**
 * The `ink` host service: a canvas to draw on, provided by the host where
 * one exists. On the iPad it is PencilKit (apps/ipad's `LumiereInk`); in a
 * browser, the web canvas (`@workshop/ink/canvas`); VS Code has none yet. A
 * plugin that injects `ink` starts only where a host provides it.
 *
 * The service knows nothing of notes or files: it is given a drawing (or
 * none) and gives one back. Where the drawing lives is the plugin's
 * business.
 */
import type {} from "@workshop/core";
import type { Sketch } from "../format";

export interface InkCapabilities {
  /** What draws: `pencilkit` on the iPad, `web` in a browser. */
  readonly engine: string;
  /** Whether input can carry pressure here (a Pencil, a pen tablet). */
  readonly pressure: boolean;
  /** Whether the canvas has the system's tool picker (PencilKit's). */
  readonly toolPicker: boolean;
}

export interface InkRequest {
  /** The drawing to edit; a new one starts blank. */
  readonly sketch?: Sketch;
  /** Shown on the canvas, so the reader knows what they are editing. */
  readonly title: string;
}

export interface InkService {
  capabilities(): Promise<InkCapabilities>;
  /**
   * Show a canvas over everything. Resolves with the drawing when the
   * reader is done, or undefined when they cancel. Rejects if a canvas is
   * already open.
   */
  draw(request: InkRequest): Promise<Sketch | undefined>;
}

declare module "@workshop/core" {
  interface Services {
    ink: InkService;
  }
}
