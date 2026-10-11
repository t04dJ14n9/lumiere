import { Schema } from "../schema";
/**
 * One message between the extension host and a webview. `batch` carries
 * coalesced notifications (see `Endpoint.notify`): its `version` grows by
 * one per batch from each endpoint, so a receiver drops a batch it has
 * already seen or one older than the last it applied.
 */
export type Envelope = (Message | Batch) & {
  session?: string;
  recipient?: string;
};
export type Message =
  | {
      kind: "request";
      id: number;
      channel: string;
      method: string;
      params: unknown;
    }
  | { kind: "response"; id: number; result: unknown }
  | { kind: "error"; id: number; code: string; message: string }
  | { kind: "notify"; channel: string; method: string; params: unknown }
  | { kind: "cancel"; id: number };
export interface Batch {
  kind: "batch";
  version: number;
  messages: Extract<Message, { kind: "notify" }>[];
}
/** More notifications than this in one batch means a runaway sender. */
export const MAX_BATCH_MESSAGES = 1024;
const id = Schema.number().min(1).max(Number.MAX_SAFE_INTEGER);
const channel = Schema.string().min(1).max(128);
const method = Schema.string().min(1).max(128);
const session = Schema.string().min(1).max(128).optional();
const schemas = {
  request: Schema.object({
    session,
    recipient: session,
    kind: Schema.union(["request"]),
    id,
    channel,
    method,
    params: Schema.unknown(),
  }),
  response: Schema.object({
    session,
    recipient: session,
    kind: Schema.union(["response"]),
    id,
    result: Schema.unknown(),
  }),
  error: Schema.object({
    session,
    recipient: session,
    kind: Schema.union(["error"]),
    id,
    code: Schema.string().max(128),
    message: Schema.string().max(4096),
  }),
  notify: Schema.object({
    session,
    recipient: session,
    kind: Schema.union(["notify"]),
    channel,
    method,
    params: Schema.unknown(),
  }),
  cancel: Schema.object({
    session,
    recipient: session,
    kind: Schema.union(["cancel"]),
    id,
  }),
  batch: Schema.object({
    session,
    recipient: session,
    kind: Schema.union(["batch"]),
    version: id,
    messages: Schema.array(Schema.unknown()),
  }),
};
export function parseEnvelope(value: unknown): Envelope {
  if (
    !value ||
    typeof value !== "object" ||
    !("kind" in value) ||
    typeof value.kind !== "string" ||
    !Object.hasOwn(schemas, value.kind)
  ) {
    throw new Error("Invalid RPC envelope");
  }
  const parsed = schemas[value.kind as keyof typeof schemas].parse(
    value,
  ) as Envelope;
  if ("id" in parsed && !Number.isSafeInteger(parsed.id)) {
    throw new Error("Invalid request ID");
  }
  if (parsed.kind === "batch") {
    if (parsed.messages.length > MAX_BATCH_MESSAGES) {
      throw new Error("RPC batch too large");
    }
    for (const message of parsed.messages) {
      if (parseEnvelope(message).kind !== "notify") {
        throw new Error("RPC batches carry notifications only");
      }
    }
  }
  return parsed;
}

export function resultEnvelope(
  id: number,
  schema: Schema<unknown>,
  value: unknown,
): Envelope {
  try {
    return { kind: "response", id, result: schema.parse(value) };
  } catch (error) {
    return {
      kind: "error",
      id,
      code: "InvalidResult",
      message: String(error).slice(0, 4096),
    };
  }
}

export function addressEnvelope(
  value: Envelope,
  session?: string,
  recipient?: string,
): Envelope {
  return parseEnvelope(
    session
      ? { ...value, session, ...(recipient ? { recipient } : {}) }
      : value,
  );
}
