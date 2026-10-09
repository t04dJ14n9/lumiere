import type { Context } from "../../kernel";
import type { ApiPlatform } from "./platform";
import type { MarkdownWorkbenchApi } from "./types";
import { immutable } from "./snapshots";
import { validateUri } from "./editors";
import { RpcError } from "../../shared/rpc/lifecycle";
export function vaultOperations(
  root: Context,
  platform: ApiPlatform,
): Pick<MarkdownWorkbenchApi, "resolveLink" | "getMetadata" | "getBacklinks"> {
  const locate = (uri: string) => {
    for (const vault of root.vaults?.all() ?? []) {
      const path = vault.pathOf(uri);
      if (path !== undefined) {
        return { index: vault.index, path };
      }
    }
    return undefined;
  };
  return {
    resolveLink(linktext, source) {
      validateUri(source);
      if (typeof linktext !== "string") {
        throw new RpcError("InvalidArgument", "Link text must be a string");
      }
      const location = locate(source.toString());
      const file = location?.index.resolveLink(linktext, location.path);
      return file ? platform.uri(file.uri) : undefined;
    },
    getMetadata(uri) {
      validateUri(uri);
      const location = locate(uri.toString());
      return location && immutable(location.index.metadata(location.path));
    },
    getBacklinks(uri) {
      validateUri(uri);
      const location = locate(uri.toString());
      return immutable(location?.index.backlinks(location.path) ?? []);
    },
  };
}
