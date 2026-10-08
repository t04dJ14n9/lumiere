import { Schema } from "../../kernel/schema";
export type Envelope =
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
const id = Schema.number().min(1).max(Number.MAX_SAFE_INTEGER);
const channel = Schema.string().min(1).max(128);
const method = Schema.string().min(1).max(128);
const schemas = {
  request: Schema.object({
    kind: Schema.union(["request"]),
    id,
    channel,
    method,
    params: Schema.unknown(),
  }),
  response: Schema.object({
    kind: Schema.union(["response"]),
    id,
    result: Schema.unknown(),
  }),
  error: Schema.object({
    kind: Schema.union(["error"]),
    id,
    code: Schema.string().max(128),
    message: Schema.string().max(4096),
  }),
  notify: Schema.object({
    kind: Schema.union(["notify"]),
    channel,
    method,
    params: Schema.unknown(),
  }),
  cancel: Schema.object({ kind: Schema.union(["cancel"]), id }),
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
  return parsed;
}
