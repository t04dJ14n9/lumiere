import type { Cancellation } from "../../shared/rpc/lifecycle";
import { registerNavigation } from "./navigation-host";
import type { Context, Infer, Plugin } from "../../kernel";
import type {
  Navigation,
  NavigationIntent,
  PanelShell,
} from "../../shared/runtime";
import type { VaultIndex } from "../vault/api";
import type {} from "./api";
import type {} from "../resources/api";
import {
  MAX_UNRESOLVED,
  protocol,
  type request as requestSchema,
} from "./protocol";
import { externalScheme, linkParts, openedVaultTarget } from "./target";
export const linksHost: Plugin<{ panel: PanelShell }> = {
  name: "links",
  inject: { required: ["rpc", "workbench", "vault", "resources"] },
  apply(ctx, { panel }) {
    registerNavigation(ctx, panel);
    registerUnresolvedLinks(ctx, panel);
    ctx.effect(() =>
      ctx.rpc.handle(protocol, "open", (request, token) =>
        openLink(ctx, panel, request, token),
      ),
    );
  },
};

/**
 * Keep the webview's set of unresolved link paths current: it asks once when
 * it starts, then hears about each change after the vault re-resolves links.
 */
function registerUnresolvedLinks(ctx: Context, panel: PanelShell): void {
  let sent = "";
  const current = () => {
    const paths = unresolvedPaths(
      ctx.vault,
      notePath(ctx.vault.root, panel.document.uri),
    );
    sent = paths.join("\n");
    return paths;
  };
  ctx.effect(() => ctx.rpc.handle(protocol, "unresolved", current));
  ctx.effect(() =>
    ctx.vault.onDidResolve(() => {
      const previous = sent;
      const paths = current();
      if (sent !== previous) {
        ctx.rpc.notify(protocol, "unresolvedChanged", paths, {
          coalesce: true,
        });
      }
    }),
  );
}

/** The note's unresolved link paths, lower-cased, sorted and de-duplicated. */
export function unresolvedPaths(vault: VaultIndex, source: string): string[] {
  const keys = new Set(
    [...vault.unresolvedLinks(source).keys()].map((path) => path.toLowerCase()),
  );
  return [...keys].sort().slice(0, MAX_UNRESOLVED);
}

/** A note's path inside the vault, from its URI. */
function notePath(root: string, uri: string): string {
  const rootPath = decodeURIComponent(new URL(root).pathname).replace(
    /\/$/,
    "",
  );
  return decodeURIComponent(new URL(uri).pathname).slice(rootPath.length + 1);
}

async function openLink(
  ctx: Context,
  panel: PanelShell,
  request: Infer<typeof requestSchema>,
  token: Cancellation,
): Promise<boolean> {
  const navigation = ctx.workbench.navigation;
  if (!navigation) {
    throw new Error("Navigation unavailable");
  }
  const intent = navigation.begin?.();
  const stop = token.onCancel(() => intent?.token.cancel());
  try {
    const sourceUri = request.source ?? panel.document.uri;
    if (sourceUri !== panel.document.uri) {
      if (!ctx.resources.authorize) {
        throw new Error("Resource authorization unavailable");
      }
      await ctx.resources.authorize(sourceUri);
    }
    if (intent?.token.cancelled || !ctx.isLive) {
      return false;
    }
    const claimed = ctx.bail("links/open", {
      ...request,
      source: sourceUri,
    });
    if (claimed) {
      return claimed;
    }
    const scheme = externalScheme(request.href);
    if (scheme) {
      return await openExternal(navigation, scheme, request.href, intent);
    }
    return await openInternal(
      ctx,
      panel,
      { ...request, source: sourceUri },
      intent,
    );
  } finally {
    void stop();
  }
}

async function openInternal(
  ctx: Context,
  panel: PanelShell,
  request: Infer<typeof requestSchema> & { source: string },
  intent?: NavigationIntent,
): Promise<boolean> {
  const navigation = ctx.workbench.navigation;
  if (!navigation) {
    throw new Error("Navigation unavailable");
  }
  const sourceUri = request.source;
  const { path, fragment } = linkParts(request.href);
  const root = ctx.vault.root;
  const source = notePath(root, sourceUri);
  const located = openedVaultTarget(ctx.vault, path, source, request.wiki);
  let uri = located.uri;
  if (!uri && located.passthrough) {
    uri = await navigation.resolve({
      root,
      ...(intent ? { intent } : {}),
      source: sourceUri,
      path,
      create: request.wiki,
      newNoteFolder: String(
        ctx.workbench.config(panel.document).features?.links?.config
          .newNoteFolder ?? "",
      ),
      folderNote: String(
        ctx.workbench.config(panel.document).features?.links?.config
          .folderNote ?? "",
      ),
    });
  }
  if (!uri || !liveIntent(ctx, intent)) {
    return false;
  }
  await navigation.open(root, uri, fragment, request.side, request.at, intent);
  return true;
}

async function openExternal(
  navigation: Navigation,
  scheme: string,
  href: string,
  intent?: NavigationIntent,
): Promise<boolean> {
  if (["javascript", "data", "command", "file"].includes(scheme)) {
    throw new Error("Unsafe link scheme");
  }
  if (
    !["http", "https", "mailto", navigation.scheme].includes(scheme) &&
    !(await navigation.confirm(`Open ${scheme} application link?`))
  ) {
    return false;
  }
  if (intent?.token.cancelled) {
    return false;
  }
  return navigation.external(href);
}

function liveIntent(ctx: Context, intent?: NavigationIntent): boolean {
  return ctx.isLive && !intent?.token.cancelled;
}
