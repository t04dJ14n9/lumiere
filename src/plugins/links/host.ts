import type { Plugin } from "../../kernel";
import type { PanelShell } from "../../shared/runtime";
import type {} from "../vault/api";
import type {} from "./api";
import type {} from "../resources/api";
import { protocol } from "./protocol";
import { externalScheme, linkParts } from "./target";
export const linksHost: Plugin<{ panel: PanelShell }> = {
  name: "links",
  inject: { required: ["rpc", "workbench", "vault", "resources"] },
  apply(ctx, { panel }) {
    ctx.effect(() =>
      ctx.rpc.handle(
        protocol,
        "initial",
        () =>
          ctx.workbench.navigation?.takeReveal(panel.document.uri) ?? {
            fragment: "",
          },
      ),
    );
    if (ctx.workbench.navigation) {
      ctx.effect(() =>
        ctx.workbench.navigation!.onReveal((uri, fragment) => {
          if (uri === panel.document.uri && panel.active()) {
            ctx.rpc.notify(protocol, "navigate", fragment);
          }
        }),
      );
    }
    ctx.effect(() =>
      ctx.rpc.handle(protocol, "open", async (request) => {
        const sourceUri = request.source ?? panel.document.uri;
        if (sourceUri !== panel.document.uri) {
          if (!ctx.resources.authorize) {
            throw new Error("Resource authorization unavailable");
          }
          await ctx.resources.authorize(sourceUri);
        }
        const claimed = ctx.bail("links/open", {
          ...request,
          source: sourceUri,
        });
        if (claimed) {
          return claimed;
        }
        const navigation = ctx.workbench.navigation;
        if (!navigation) {
          throw new Error("Navigation unavailable");
        }
        const scheme = externalScheme(request.href);
        if (scheme) {
          if (["javascript", "data", "command", "file"].includes(scheme)) {
            throw new Error("Unsafe link scheme");
          }
          if (
            !["http", "https", "mailto", navigation.scheme].includes(scheme) &&
            !(await navigation.confirm(`Open ${scheme} application link?`))
          ) {
            return false;
          }
          return navigation.external(request.href);
        }
        const { path, fragment } = linkParts(request.href);
        const root = ctx.vault.root;
        const source = decodeURIComponent(new URL(sourceUri).pathname).slice(
          decodeURIComponent(new URL(root).pathname).replace(/\/$/, "").length +
            1,
        );
        const file = request.wiki
          ? ctx.vault.resolveLink(path, source)
          : undefined;
        let uri = file?.uri;
        if (!uri) {
          uri = await navigation.resolve({
            root,
            source: sourceUri,
            path,
            create: request.wiki,
            folderNote: String(
              ctx.workbench.config(panel.document).features?.links?.config
                .folderNote ?? "",
            ),
          });
        }
        if (!uri) {
          return false;
        }
        await navigation.open(root, uri, fragment, request.side, request.at);
        return true;
      }),
    );
  },
};
