import type { Context, Plugin } from "../../kernel";
import type { PanelShell } from "../../shared/runtime";
import { owningBundle } from "../../markdown/okf";
import type {} from "../okfCore/api";
import type {} from "../vault/api";
import type {} from "../resources/api";
import { planSourceOpen } from "./open";
import { protocol } from "./protocol";

/** Opens a Sources resource after host authorization. The webview never fetches it. */
export const sourcesPropertyHost: Plugin<{ panel: PanelShell }> = {
  name: "sourcesProperty",
  inject: { required: ["workbench", "rpc", "okf", "resources", "vaults"] },
  apply(ctx, { panel }) {
    ctx.effect(() =>
      ctx.rpc.handle(protocol, "open", async ({ resource }) => ({
        opened: await openResource(ctx, panel, resource),
      })),
    );
    ctx.effect(() =>
      ctx.rpc.handle(protocol, "copy", async ({ text }) => {
        await ctx.workbench.clipboard.write(text);
        return { copied: true };
      }),
    );
  },
};

async function openResource(
  ctx: Context,
  panel: PanelShell,
  resource: string,
): Promise<boolean> {
  const located = await ctx.vaults.locate(panel.document.uri);
  if (!located) {
    return false;
  }
  const text = panel.document.getText();
  const roots = ctx.okf.bundles(located.vault).map((bundle) => bundle.root);
  const bundleRoot = owningBundle(roots, located.path);
  const plan = planSourceOpen({
    resource,
    text,
    documentPath: located.path,
    ...(bundleRoot === undefined ? {} : { bundleRoot }),
    live: ctx.okf.live,
  });
  if (plan.action === "external" && plan.url) {
    await ctx.workbench.execute("vscode.open", plan.url);
    return true;
  }
  if (plan.action !== "workspace" || !plan.path) {
    return false;
  }
  const file = located.vault.index.file(plan.path);
  if (!file) {
    return false;
  }
  await ctx.resources.authorize?.(file.uri);
  await ctx.vaults.open(file.uri);
  return true;
}
