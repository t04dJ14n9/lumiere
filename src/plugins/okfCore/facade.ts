import type { Vault } from "../vault/api";
import type { Okf, OkfScope } from "./api";

const emptyScope = (): OkfScope => ({ ambiguous: true, choices: [] });

/** A stable `okf` object panels can hold while okfCore binds and unbinds the implementation. */
export interface OkfFacade extends Okf {
  bind(inner: Okf | undefined): void;
}

export function createOkfFacade(): OkfFacade {
  let inner: Okf | undefined;
  return {
    get live() {
      return inner?.live ?? false;
    },
    bind(next) {
      inner = next;
    },
    bundles(vault: Vault) {
      return inner?.bundles(vault) ?? [];
    },
    scope(vault: Vault, path: string | undefined) {
      return inner?.scope(vault, path) ?? emptyScope();
    },
  };
}
