import type { Plugin } from "../../kernel";
import type { Vault } from "../vault/api";
import { switcherItems } from "./ranking";
import type { SwitcherTarget } from "./ranking";

/** **Markdown Workbench: Quick Switcher**: open or create a note by name. */
export const quickSwitcherHost: Plugin = {
  name: "quickSwitcher",
  inject: { required: ["workbench", "vaults"] },
  apply(ctx) {
    const views = ctx.workbench.views;
    if (!views) {
      return;
    }
    const activeVault = async (): Promise<Vault | undefined> => {
      const active = views.activeNote();
      const located = active ? await ctx.vaults.locate(active) : undefined;
      return located?.vault ?? (await ctx.vaults.forWorkspace());
    };
    const create = async (vault: Vault, name: string) => {
      const active = views.activeNote();
      const uri = await ctx.workbench.navigation?.resolve({
        root: vault.index.root,
        source: active ?? `${vault.index.root}/`,
        path: name,
        create: true,
        folderNote: "",
      });
      if (uri) {
        await ctx.vaults.open(uri);
      }
    };
    const open = async (vault: Vault, target: SwitcherTarget) => {
      if (target.kind === "note") {
        await ctx.vaults.open(target.file.uri);
      } else {
        await create(
          vault,
          target.kind === "create" ? target.name : target.linkpath,
        );
      }
    };
    ctx.effect(() =>
      views.command("markdownWorkbench.quickSwitcher", async () => {
        const vault = await activeVault();
        if (!vault) {
          ctx.workbench.error("Open a folder to use the quick switcher.");
          return;
        }
        const result = await views.pick({
          placeholder: "Find or create a note…",
          items: (query) => switcherItems(vault.index, query),
        });
        if (result?.item) {
          await open(vault, result.item.value);
        } else if (result?.query.trim()) {
          await create(vault, result.query.trim());
        }
      }),
    );
  },
};
