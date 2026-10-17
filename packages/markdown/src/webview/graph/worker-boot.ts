export interface ScriptWorker {
  postMessage(message: unknown): void;
  terminate(): void;
  onmessage: ((event: MessageEvent<unknown>) => void) | null;
}

export interface LayoutWorkerSession {
  worker: ScriptWorker;
  objectUrl: string;
}

/**
 * VS Code webviews only start workers from `blob:` or `data:` URLs. The
 * bundled script is fetched from the extension, then handed to the worker
 * as a blob. A stale ticket revokes that URL instead of starting layout.
 */
export async function startLayoutWorker(options: {
  scriptUrl: string;
  ticket: number;
  isCurrent(ticket: number): boolean;
  fetchScript(url: string): Promise<string>;
  createObjectUrl(source: string): string;
  revokeObjectUrl(url: string): void;
  createWorker(objectUrl: string): ScriptWorker;
}): Promise<LayoutWorkerSession | undefined> {
  const source = await readScript(options);
  if (source === undefined || !options.isCurrent(options.ticket)) {
    return undefined;
  }
  const objectUrl = options.createObjectUrl(source);
  if (!options.isCurrent(options.ticket)) {
    options.revokeObjectUrl(objectUrl);
    return undefined;
  }
  const worker = options.createWorker(objectUrl);
  if (!options.isCurrent(options.ticket)) {
    worker.terminate();
    options.revokeObjectUrl(objectUrl);
    return undefined;
  }
  return { worker, objectUrl };
}

export function stopLayoutWorker(
  session: LayoutWorkerSession | undefined,
  revokeObjectUrl: (url: string) => void,
): void {
  if (!session) {
    return;
  }
  session.worker.postMessage({ type: "stop" });
  session.worker.terminate();
  revokeObjectUrl(session.objectUrl);
}

async function readScript(options: {
  scriptUrl: string;
  fetchScript(url: string): Promise<string>;
}): Promise<string | undefined> {
  try {
    return await options.fetchScript(options.scriptUrl);
  } catch {
    return undefined;
  }
}
