/**
 * Batches the viewer's state reports into versioned `patch` messages (see
 * `shared/messages.ts` for the invariants the host relies on).
 *
 * `report` merges a change into the pending patch, latest value per part,
 * and schedules one send; `post` sends any other message, after the
 * pending patch; `loaded` marks the start of a new load, so later patches
 * carry its number.
 */
import type { ViewerMessage, ViewerPatch } from '../shared/messages';

export type OutgoingMessage = Exclude<ViewerMessage, { type: 'patch' }>;

export interface Outbox {
  report(patch: ViewerPatch): void;
  post(message: OutgoingMessage): void;
  /** The viewer received new bytes: what was pending belongs to the old ones. */
  loaded(): void;
  flush(): void;
}

/** How long changes collect before a patch goes out: about one frame. */
export const PATCH_DELAY_MS = 16;

export function createOutbox(
  send: (message: ViewerMessage) => void,
  schedule: (flush: () => void) => void = flush => void setTimeout(flush, PATCH_DELAY_MS),
): Outbox {
  let pending: ViewerPatch | undefined;
  let version = 0;
  let load = 0;
  const flush = (): void => {
    if (!pending) return;
    const patch = pending;
    pending = undefined;
    send({ type: 'patch', version: ++version, load, patch });
  };
  return {
    report(patch) {
      const idle = !pending;
      pending = { ...pending, ...patch };
      if (idle) schedule(flush);
    },
    post(message) {
      flush();
      send(message);
    },
    loaded() {
      flush();
      load++;
    },
    flush,
  };
}
