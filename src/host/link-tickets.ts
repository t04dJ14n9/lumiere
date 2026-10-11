import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
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
  private readonly secret = randomBytes(32);
  private live = true;
  issue(ticket: Ticket): [string, string] {
    // Command openers may decode URI arguments again. Base64url has no percent escapes.
    const payload = Buffer.from(JSON.stringify(ticket), "utf8").toString(
      "base64url",
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
    if (
      !timingSafeEqual(
        Buffer.from(signature, "hex"),
        Buffer.from(this.sign(payload), "hex"),
      )
    ) {
      return undefined;
    }
    return JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8"),
    ) as Ticket;
  }
  dispose(): void {
    this.live = false;
  }
  private sign(payload: string): string {
    return createHmac("sha256", this.secret).update(payload).digest("hex");
  }
}
