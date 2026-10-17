import type { Disposer } from "@workshop/core";

/**
 * The rendered property subtree. Named without a DOM type so the host project,
 * which has no DOM library, can still see this service.
 */
export interface PropertyRoot {
  readonly ownerDocument?: unknown;
}

export interface PropertyRenderer {
  /** Property name, compared case-insensitively. */
  readonly key: string;
  render(value: unknown, values: Record<string, unknown>): string | undefined;
  bind?(root: PropertyRoot): void;
}

export interface PropertyRenderers {
  register(renderer: PropertyRenderer): Disposer;
  render(
    key: string,
    value: unknown,
    values: Record<string, unknown>,
  ): string | undefined;
  bind(root: PropertyRoot): void;
}

declare module "@workshop/core" {
  interface Services {
    propertyRenderers: PropertyRenderers;
  }
  interface Events {
    /** @mode bail */ "editor/focusProperties": () => true | undefined;
    /** @mode bail */ "editor/focusTitle": () => true | undefined;
  }
}

export {};
