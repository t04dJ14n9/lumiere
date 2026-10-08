import type { Plugin } from "../../kernel";
import { snapshotVault } from "./stub";
export const vaultHost: Plugin<{ root: string }> = {
  name: "vault",
  inject: { required: ["workbench"] },
  async apply(ctx, { root }) {
    const files = await ctx.workbench.files(root);
    ctx.provide("vault", snapshotVault(root, files));
  },
};
