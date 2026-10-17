import type { Vault } from "../vault/api";

export interface OkfBundle {
  /** Stable scope id for one bundle in one vault. */
  readonly id: string;
  readonly name: string;
  /** Vault-relative bundle root. */
  readonly root: string;
  readonly vaultRoot: string;
}

export interface OkfScope {
  /** True when the note has no single owning bundle. The caller must ask. */
  readonly ambiguous: boolean;
  readonly owner?: OkfBundle;
  readonly choices: readonly OkfBundle[];
}

export interface Okf {
  /** False after okfCore stops, including on a facade shared with open panels. */
  readonly live: boolean;
  bundles(vault: Vault): readonly OkfBundle[];
  /** Owning bundle, or an explicit choice list. Never guesses a workspace folder. */
  scope(vault: Vault, path: string | undefined): OkfScope;
}

declare module "@workshop/core" {
  interface Services {
    okf: Okf;
  }
}
