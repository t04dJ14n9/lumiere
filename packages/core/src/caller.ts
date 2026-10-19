import type { Context } from "./types";

/**
 * Optional service hook: a service implementing `[bindCaller](caller)`
 * returns a facade bound to the consuming plugin, so registrations made
 * through it are owned by (and undone with) that plugin without call sites
 * passing their own name. Each consumer context gets one cached facade.
 */
export const bindCaller = Symbol("bindCaller");

export interface CallerBound<T = unknown> {
  [bindCaller](caller: Context): T;
}

export function isCallerBound(value: unknown): value is CallerBound {
  return (
    (typeof value === "object" || typeof value === "function") &&
    value !== null &&
    bindCaller in value &&
    typeof value[bindCaller] === "function"
  );
}
