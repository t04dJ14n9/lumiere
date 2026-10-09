import type { Context } from "./context";
import type { Inject, Plugin, Services } from "./types";
/** Optional service hook: resolve a facade for the context reading the service. */
export const bindCaller = Symbol("bindCaller");
export interface CallerBound<T = unknown> {
  [bindCaller](caller: Context): T;
}
export abstract class Service<C = void> {
  static readonly inject?: Inject;
  constructor(
    protected readonly ctx: Context,
    readonly serviceName: keyof Services,
    protected readonly config: C,
  ) {}
  protected start?(): Promise<void>;
  protected stop?(): Promise<void>;
  async activate(): Promise<void> {
    this.ctx.effect(() => () => this.stop?.());
    await this.start?.();
    this.ctx.provide(
      this.serviceName,
      this as unknown as Services[keyof Services],
    );
  }
}
export interface ServiceClass<C> {
  new (ctx: Context, config: C): Service<C>;
  readonly name: string;
  readonly inject?: Inject;
}
export function asPlugin<C>(
  definition: Plugin<C> | ServiceClass<C>,
): Plugin<C> {
  return typeof definition === "function"
    ? {
        name: definition.name,
        ...(definition.inject && { inject: definition.inject }),
        apply: (ctx, config) => new definition(ctx, config).activate(),
      }
    : definition;
}
