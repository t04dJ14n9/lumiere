import type { Context } from "./context";
import type { Schema } from "./schema";
// Open interfaces are extended by pure service and event contracts.
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface Services {}
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface Events {}
export type Disposer = () => void | Promise<void>;
export interface Inject {
  readonly required?: readonly (keyof Services)[];
  readonly optional?: readonly (keyof Services)[];
}
export interface Plugin<C = void> {
  readonly name: string;
  readonly inject?: Inject;
  readonly config?: Schema<C>;
  apply(ctx: Context, config: C): void | Promise<void>;
  reconfigure?(ctx: Context, config: C): boolean;
}
export type EventFunction<K extends keyof Events> = Events[K] extends (...args: infer A) => infer R
  ? (...args: A) => R
  : never;
