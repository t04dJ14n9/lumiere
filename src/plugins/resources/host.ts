import type { Plugin } from "../../kernel";
import type { PanelShell } from "../../shared/runtime";
import { mediaKind } from "../../shared/media-kinds";
import type {} from "../vault/api";
import type { Resources } from "./api";
import { containedResource, contains } from "./containment";
import { protocol } from "./protocol";
export const resourcesHost: Plugin<{ panel: PanelShell }> = {
  name: "resources",
  inject: { required: ["rpc", "workbench", "vault"] },
  apply(ctx, { panel }) {
    const known = new Set([panel.document.uri]);
    const resources: Resources = {
      async authorize(source) {
        if (!known.has(source) || !contains(ctx.vault.root, source)) throw new Error("Unknown note source");
        const stat = await ctx.workbench.stat(source);
        await containedResource(ctx.vault.root, source, stat.symbolicLink, (uri) => ctx.workbench.stat(uri));
      },
      async load(target, source = panel.document.uri) {
        if (!known.has(source) || !contains(ctx.vault.root, source))
          throw new Error("Unknown note source");
        if (/^[a-z][a-z\d+.-]*:/i.test(target) || target.startsWith("//"))
          throw new Error("Resource must be a vault link");
        const relativeSource = decodeURIComponent(new URL(source).pathname).slice(
          decodeURIComponent(new URL(ctx.vault.root).pathname).replace(/\/$/, "").length + 1,
        );
        const file = ctx.vault.resolveLink(target, relativeSource);
        if (!file) throw new Error("Resource not found");
        const stat = await ctx.workbench.stat(file.uri);
        await containedResource(ctx.vault.root, file.uri, stat.symbolicLink, (uri) =>
          ctx.workbench.stat(uri),
        );
        const kind = /\.md$/i.test(file.path)
          ? "note"
          : /\.pdf$/i.test(file.path)
            ? "pdf"
            : (mediaKind(file.path) ?? "file");
        const text =
          kind === "note"
            ? new TextDecoder().decode(await ctx.workbench.read(file.uri))
            : undefined;
        if (kind === "note") known.add(file.uri);
        return { kind, source: file.uri, url: panel.resource(file.uri) + `?v=${stat.mtime}`, text };
      },
    };
    ctx.provide("resources", resources);
    ctx.effect(() =>
      ctx.rpc.handle(protocol, "load", (params) => resources.load(params.target, params.source)),
    );
  },
};
