import type { WorkerChannel, WorkerLauncher } from "@workshop/platform";
import { metadata } from "../markdown/metadata";
import type { NoteMetadata } from "../markdown/metadata";
import type { NoteParser } from "../plugins/vault/api";
import type { ParseRequest, ParseResponse } from "../workers/vault-worker";

interface Pending {
  resolve: (value: NoteMetadata) => void;
  reject: (error: Error) => void;
}

/**
 * Parses notes in the vault worker (src/workers/vault-worker.ts). If the worker
 * cannot start or exits, parsing continues in the extension host, so
 * indexing never stops.
 */
export function createVaultParser(workers: WorkerLauncher): {
  parse: NoteParser;
  dispose(): void;
} {
  const pending = new Map<number, Pending>();
  let next = 0;
  let worker: WorkerChannel | undefined = startWorker(workers, pending, () => {
    worker = undefined;
  });
  return {
    parse(text) {
      if (!worker) {
        return Promise.resolve(metadata(text));
      }
      const id = next++;
      const buffer = new TextEncoder().encode(text).buffer as ArrayBuffer;
      const request: ParseRequest = { id, text: buffer };
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
        worker!.post(request, [buffer]);
      });
    },
    dispose() {
      void worker?.terminate();
      worker = undefined;
    },
  };
}

function startWorker(
  workers: WorkerLauncher,
  pending: Map<number, Pending>,
  onExit: () => void,
): WorkerChannel | undefined {
  let worker: WorkerChannel;
  try {
    worker = workers.start("vault");
  } catch {
    return undefined;
  }
  worker.unref();
  worker.onMessage((message) => {
    const response = message as ParseResponse;
    const request = pending.get(response.id);
    pending.delete(response.id);
    if ("error" in response) {
      request?.reject(new Error(response.error));
    } else {
      request?.resolve(response.metadata);
    }
  });
  worker.onExit(() => {
    onExit();
    for (const request of pending.values()) {
      request.reject(new Error("The indexing worker stopped"));
    }
    pending.clear();
  });
  return worker;
}
