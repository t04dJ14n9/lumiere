/**
 * The plugins' tree views (Outline now; Backlinks, Tags and Outgoing Links
 * the same way), served by host-node (`@workshop/host-node/views`).
 */
import {
  VIEWS_PATH,
  type TreeEvent,
  type TreeSnapshot,
} from "@workshop/host-node/views";

const listeners = new Set<(event: TreeEvent) => void>();
let source: EventSource | undefined;

async function post(path: string, body: unknown): Promise<void> {
  const response = await fetch(`${VIEWS_PATH}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok && response.status !== 404) {
    throw new Error(`${response.status} ${VIEWS_PATH}${path}`);
  }
}

export const views = {
  /** The tree now; undefined while its plugin has not registered it. */
  async snapshot(viewId: string): Promise<TreeSnapshot | undefined> {
    const response = await fetch(`${VIEWS_PATH}/${encodeURIComponent(viewId)}`);
    if (response.status === 404) {
      return undefined;
    }
    if (!response.ok) {
      throw new Error(`${response.status} ${VIEWS_PATH}/${viewId}`);
    }
    return (await response.json()) as TreeSnapshot;
  },
  /** The reader clicked a node. */
  run: (viewId: string, id: string) =>
    post(`/${encodeURIComponent(viewId)}/run`, { id }),
  /** The tree is on screen, or not; some plugins only follow the caret while it is. */
  setVisible: (viewId: string, visible: boolean) =>
    post(`/${encodeURIComponent(viewId)}/visible`, { visible }),
  /** Every tree's events, over one stream for the window. */
  events(listener: (event: TreeEvent) => void): () => void {
    listeners.add(listener);
    source ??= openStream();
    return () => {
      listeners.delete(listener);
      if (listeners.size === 0) {
        source?.close();
        source = undefined;
      }
    };
  },
};

function openStream(): EventSource {
  const stream = new EventSource(`${VIEWS_PATH}/events`);
  stream.onmessage = (message: MessageEvent<string>) => {
    const event = JSON.parse(message.data) as TreeEvent;
    for (const listener of listeners) {
      listener(event);
    }
  };
  return stream;
}
