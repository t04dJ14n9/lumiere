import type { Plugin } from "@workshop/core";
import { contributionId } from "../../shared/setting-schema";
import type { Vault, Vaults } from "../vault/api";
import { switcherItems } from "./ranking";
import type { SwitcherTarget } from "./ranking";

/** **Markdown Workshop: Quick Switcher**: open or create a note by name. */
export const quickSwitcherHost: Plugin = {
  name: "quickSwitcher",
  inject: { required: ["workshop", "vaults"] },
  apply(ctx) {
    const views = ctx.workshop.views;
    if (!views) {
      return;
    }
    const create = async (vault: Vault, name: string, source: string) => {
      const uri = await ctx.workshop.navigation?.resolve({
        root: vault.index.root,
        source,
        path: name,
        create: true,
        folderNote: "",
      });
      if (uri) {
        await ctx.vaults.open(uri);
      }
    };
    const open = async (
      vault: Vault,
      target: SwitcherTarget,
      source: string,
    ) => {
      if (target.kind === "note") {
        await ctx.vaults.open(target.file.uri);
      } else {
        await create(
          vault,
          target.kind === "create" ? target.name : target.linkpath,
          source,
        );
      }
    };
    ctx.effect(() =>
      views.command(contributionId("quickSwitcher"), async () => {
        const active = views.activeNote();
        const vault = await switcherVault(ctx.vaults, active);
        if (!vault) {
          ctx.workshop.error("Open a folder to use the quick switcher.");
          return;
        }
        // Keep the initiating note through the picker, even if focus changes.
        const source = active ?? `${vault.index.root}/`;
        await ctx.workshop.configuration?.prepare(source);
        const result = await views.pick({
          placeholder: "Find or create a note…",
          items: (query) => switcherItems(vault.index, query),
        });
        if (result?.item) {
          await open(vault, result.item.value, source);
        } else if (result?.query.trim()) {
          await create(vault, result.query.trim(), source);
        }
      }),
    );
  },
};

async function switcherVault(
  vaults: Vaults,
  active: string | undefined,
): Promise<Vault | undefined> {
  const located = active ? await vaults.locate(active) : undefined;
  return located?.vault ?? (await vaults.forWorkspace());
}
