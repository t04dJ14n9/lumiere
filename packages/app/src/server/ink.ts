/**
 * The `ink` host service on Lumière's server. The plugins run here; the
 * canvas is in the window (`@workshop/ink/canvas`), so a drawing the
 * plugins ask for waits here until the window answers:
 *
 * - the window hears `{"type":"ink"}` on GET /api/events;
 * - it reads the drawing with GET /api/ink, and opens its canvas on it;
 * - it posts the drawing, or nothing when cancelled, to POST /api/ink.
 *
 * Drawings cross as a sketch file's metadata JSON (`encodeSketch`), and
 * the answer is checked as a file would be. A window that loads while a
 * drawing waits (a reload) opens it again.
 */
import {
  checkedPencilKit,
  decodeSketch,
  emptySketch,
  encodeSketch,
  type Sketch,
} from "@workshop/ink/format";
import type { InkRequest, InkService } from "@workshop/ink/service";

/** A drawing waiting for the window: `sketch` is `encodeSketch`'s JSON. */
export interface InkWaiting {
  readonly id: string;
  readonly title: string;
  readonly sketch: string;
}

interface Waiting {
  readonly request: InkWaiting;
  readonly resolve: (sketch: Sketch | undefined) => void;
  readonly reject: (error: unknown) => void;
}

export class WindowInk implements InkService {
  private waiting: Waiting | undefined;
  private count = 0;
  private readonly listeners = new Set<() => void>();

  async capabilities() {
    return { engine: "web", pressure: true, toolPicker: false };
  }

  draw(request: InkRequest): Promise<Sketch | undefined> {
    if (this.waiting) {
      return Promise.reject(new Error("A sketch is already open."));
    }
    this.count += 1;
    const waiting: InkWaiting = {
      id: `ink-${this.count}-${Date.now().toString(36)}`,
      title: request.title,
      sketch: encodeSketch(request.sketch ?? emptySketch()),
    };
    return new Promise((resolve, reject) => {
      this.waiting = { request: waiting, resolve, reject };
      this.changed();
    });
  }

  /** The drawing the window should show, if one waits. */
  request(): InkWaiting | undefined {
    return this.waiting?.request;
  }

  /**
   * The window's answer to drawing `id`: the drawing as `encodeSketch`'s
   * JSON, or undefined when it was cancelled. Throws for any drawing but
   * the one waiting; a drawing that does not read as a sketch fails the
   * plugin's request, which says so.
   */
  answer(id: string, sketch: string | undefined): void {
    const waiting = this.waiting;
    if (!waiting || waiting.request.id !== id) {
      throw new Error("No such drawing is waiting.");
    }
    this.waiting = undefined;
    this.changed();
    if (sketch === undefined) {
      waiting.resolve(undefined);
      return;
    }
    try {
      waiting.resolve(checkedPencilKit(decodeSketch(sketch)));
    } catch (error) {
      waiting.reject(error);
      throw error;
    }
  }

  /** A drawing started or ended waiting. */
  onChange(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** The server is stopping: a drawing still waiting is given up. */
  close(): void {
    const waiting = this.waiting;
    this.waiting = undefined;
    waiting?.resolve(undefined);
  }

  private changed(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }
}
