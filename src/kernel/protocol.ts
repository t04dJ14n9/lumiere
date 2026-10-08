import type { Schema } from "./schema";
export interface Method<P = unknown, R = unknown> {
  params: Schema<P>;
  result: Schema<R>;
}
export interface Protocol {
  readonly id: string;
  readonly requests: Record<string, Method>;
  readonly notifications: Record<string, Schema<unknown>>;
}
export function defineProtocol<const R extends Record<string, Method>, const N extends Record<string, Schema<unknown>>>(
  id: string,
  methods: { requests: R; notifications: N },
): Readonly<{ id: string; requests: R; notifications: N }> {
  if (!/^[a-zA-Z][\w.-]*$/.test(id)) throw new Error("Invalid protocol namespace");
  return Object.freeze({
    id,
    requests: Object.freeze({ ...methods.requests }),
    notifications: Object.freeze({ ...methods.notifications }),
  });
}
