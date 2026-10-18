import {
  base64ToBytes,
  bytesToBase64Url,
  equalInConstantTime,
  type Digests,
} from "@workshop/platform";
export interface Ticket {
  source: string;
  version: number;
  from: number;
  to: number;
  raw: string;
  href: string;
}
/** Stateless signed tickets stay valid across provider refreshes without a URI mailbox. */
export class LinkTickets {
  private readonly secret = crypto.getRandomValues(new Uint8Array(32));
  private live = true;
  constructor(private readonly digests: Digests) {}
  issue(ticket: Ticket): [string, string] {
    // Command openers may decode URI arguments again. Base64url has no percent escapes.
    const payload = bytesToBase64Url(
      new TextEncoder().encode(JSON.stringify(ticket)),
    );
    return [payload, this.sign(payload)];
  }
  read(payload: unknown, signature: unknown): Ticket | undefined {
    if (
      !this.live ||
      typeof payload !== "string" ||
      payload.length > 32_768 ||
      typeof signature !== "string" ||
      !/^[a-f0-9]{64}$/.test(signature)
    ) {
      return undefined;
    }
    if (!equalInConstantTime(signature, this.sign(payload))) {
      return undefined;
    }
    return JSON.parse(
      new TextDecoder().decode(base64ToBytes(payload)),
    ) as Ticket;
  }
  dispose(): void {
    this.live = false;
  }
  private sign(payload: string): string {
    return this.digests.hmacSha256(this.secret, payload);
  }
}
