import type { Envelope } from "./envelope";
import type { Pending } from "./endpoint-types";
import { RpcError } from "./lifecycle";

export function receiveResponse(
  envelope: Extract<Envelope, { kind: "response" | "error" }>,
  pendingRequests: Map<number, Pending>,
): void {
  const pending = pendingRequests.get(envelope.id);
  if (!pending) {
    return;
  }
  pendingRequests.delete(envelope.id);
  pending.cleanup();
  if (envelope.kind === "error") {
    pending.reject(new RpcError(envelope.code, envelope.message));
    return;
  }
  try {
    pending.resolve(pending.schema.parse(envelope.result));
  } catch (error) {
    pending.reject(new RpcError("InvalidResult", String(error)));
  }
}
