import type { Plugin } from "../../kernel";
import type {} from "./api";
import { VaultRegistry } from "./registry";

/**
 * Root-level half: provides `vaults`, one shared index per vault, and keeps
 * it current with open documents and settings.
 */
export const vaultsHost: Plugin = {
  name: "vault",
  inject: { required: ["vaultSystem"], optional: ["workshop"] },
  apply(ctx) {
    const system = ctx.vaultSystem;
    const registry = new VaultRegistry(
      system,
      {
        changed: (root, change) => ctx.emit("vault/changed", root, change),
        resolved: (root) => ctx.emit("vault/resolved", root),
        error: (message, error) => ctx.logger.warn(message, error),
      },
      ctx.workshop?.navigation,
    );
    ctx.effect(() => () => registry.dispose());
    ctx.effect(() =>
      system.onDocumentChanged((uri, text) => registry.setOverlay(uri, text)),
    );
    ctx.effect(() =>
      system.onDocumentClosed((uri) => registry.clearOverlay(uri)),
    );
    ctx.effect(() => system.onSettingsChanged(() => registry.applySettings()));
    ctx.provide("vaults", registry);
  },
};

/** Panel-level half: the `vault` service for the note open in this panel. */
export const vaultHost: Plugin<{ documentUri: string }> = {
  name: "vault",
  inject: { required: ["vaults"] },
  async apply(ctx, { documentUri }) {
    const vault = await ctx.vaults.forDocument(documentUri);
    ctx.provide("vault", vault.index);
  },
};
