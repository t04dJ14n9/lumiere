import type { Pending } from "./endpoint-types";
import type { CancelToken } from "./lifecycle";
import { RpcError } from "./lifecycle";
import type { Envelope } from "./envelope";

/** Only the ready handshake can replace a renderer; retired traffic stays stale. */
export class PeerSession {
  private current: string | undefined;
  private readonly retired = new Set<string>();
  constructor(
    private readonly ownSession: string,
    private readonly restartOn?: string,
  ) {}
  get session(): string | undefined {
    return this.current;
  }
  accept(envelope: Envelope): "same" | "replace" | "drop" {
    if (
      envelope.recipient !== undefined &&
      envelope.recipient !== this.ownSession
    ) {
      return "drop";
    }
    if (envelope.session === this.current) {
      return "same";
    }
    if (!envelope.session || this.retired.has(envelope.session)) {
      return "drop";
    }
    if (this.current === undefined) {
      this.current = envelope.session;
      return "same";
    }
    if (
      envelope.kind !== "request" ||
      `${envelope.channel}/${envelope.method}` !== this.restartOn
    ) {
      return "drop";
    }
    this.retired.add(this.current);
    this.current = envelope.session;
    return "replace";
  }
}

export function cancelPeer(
  pending: Map<number, Pending>,
  incoming: Map<number, { token: CancelToken }>,
): void {
  for (const request of pending.values()) {
    request.cleanup();
    request.reject(new RpcError("Cancelled", "RPC peer replaced"));
  }
  pending.clear();
  for (const request of incoming.values()) {
    request.token.cancel();
  }
  incoming.clear();
}
