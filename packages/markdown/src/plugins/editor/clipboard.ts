import type { Endpoint } from "../../shared/rpc/endpoint";
import { protocol } from "./protocol";

/** Clipboard access is host mediated; RPC owns cancellation and timeouts. */
export function createClipboard(rpc: Endpoint) {
  return {
    read: () => rpc.call(protocol, "clipboardRead", {}),
    write: async (text: string): Promise<void> => {
      await rpc.call(protocol, "clipboardWrite", { text });
    },
  };
}
