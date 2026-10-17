/**
 * Stopping a PDFium engine with a deadline. Kept free of browser and
 * EmbedPDF imports so it is unit-tested under Node against fake engines.
 *
 * Invariant: `stopEngine` settles within `deadlineMs` (plus the time
 * `destroy()` itself takes), whatever the engine does: it asks the engine to
 * close its documents, and calls `destroy()` (which terminates a worker
 * engine's worker) as soon as that finishes, fails or the deadline passes,
 * whichever is first. It rejects if `destroy()` fails.
 */

/** The part of a PDFium engine (EmbedPDF's PdfEngine) that stopping needs. */
export interface StoppableEngine {
  closeAllDocuments(): {
    wait(onResult: () => void, onError: (error: unknown) => void): void;
  };
  destroy?(): unknown;
}

/** EmbedPDF's tasks: `wait(onResult, onError)`. */
interface TaskLike {
  wait(onResult: () => void, onError: (error: unknown) => void): void;
}

function isTask(value: unknown): value is TaskLike {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as TaskLike).wait === "function"
  );
}

export function stopEngine(
  engine: StoppableEngine,
  deadlineMs: number,
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    let destroying = false;
    const destroy = (): void => {
      if (destroying) {
        return;
      }
      destroying = true;
      clearTimeout(timer);
      try {
        const result = engine.destroy?.();
        // EmbedPDF's destroy() returns a task that settles at once.
        if (isTask(result)) {
          result.wait(resolve, (error) =>
            reject(
              new Error(`The PDF engine could not stop: ${describe(error)}`),
            ),
          );
        } else {
          resolve();
        }
      } catch (error) {
        reject(error instanceof Error ? error : new Error(describe(error)));
      }
    };
    const timer = setTimeout(destroy, deadlineMs);
    try {
      engine.closeAllDocuments().wait(destroy, destroy);
    } catch {
      destroy();
    }
  });
}

function describe(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === "object" && error !== null && "message" in error) {
    return String((error as { message: unknown }).message);
  }
  return String(error);
}
