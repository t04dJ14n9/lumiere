import type { Protocol } from "../../kernel/protocol";
import type { Schema } from "../schema";
import type { Message } from "./envelope";
import type { Cancellation } from "./lifecycle";

/** Internal shapes of `Endpoint` (endpoint.ts). */
export type Handler = {
  protocol: Protocol;
  run: (value: unknown, token: Cancellation) => unknown;
};
export type Pending = {
  schema: Schema<unknown>;
  resolve(value: unknown): void;
  reject(error: unknown): void;
  cleanup(): void;
};
export interface OutgoingRequest {
  protocol: Protocol;
  method: string;
  parsed: unknown;
  schema: Schema<unknown>;
  options: { timeout?: number; token?: Cancellation };
}
export type Notify = Extract<Message, { kind: "notify" }>;
