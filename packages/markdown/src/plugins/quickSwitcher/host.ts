import type { Plugin } from "@workshop/core";
import { contributionId } from "../../shared/setting-schema";
import type { Vault, Vaults } from "../vault/api";
import { switcherItems } from "./ranking";
import type { SwitcherTarget } from "./ranking";

/** **Lumière: Quick Switcher**: open or create a note by name. */
export const quickSwitcherHost: Plugin = {
  name: "quickSwitcher",
  inject: {
    required: [
      "dialogs",
      "settings",
      "navigation",
      "vaults",
      "hostCommands",
      "activeEditor",
    ],
  },
  apply(ctx) {
    const create = async (vault: Vault, name: string, source: string) => {
      const uri = await ctx.navigation.resolve({
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
      ctx.hostCommands.register(contributionId("quickSwitcher"), async () => {
        const active = ctx.activeEditor.note();
        const vault = await switcherVault(ctx.vaults, active);
        if (!vault) {
          ctx.dialogs.error("Open a folder to use the quick switcher.");
          return;
        }
        // Keep the initiating note through the picker, even if focus changes.
        const source = active ?? `${vault.index.root}/`;
        await ctx.settings.effective.prepare(source);
        const result = await ctx.dialogs.pick({
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
