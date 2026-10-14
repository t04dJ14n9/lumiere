import { okfLinkText, owningBundle, resolveOkfLink } from "../../markdown/okf";
import type { LinkPolicy } from "../vault/api";

/** The OKF link policy. It reads bundle roots supplied by okfCore; the vault does not import it. */
export function okfLinkPolicy(
  bundlesFor: (vaultRoot: string) => readonly string[],
): LinkPolicy {
  return {
    id: "okf",
    resolve(query) {
      const bundleRoot = owningBundle(
        bundlesFor(query.vaultRoot),
        query.sourcePath,
      );
      const action = resolveOkfLink({
        linktext: query.linktext,
        sourcePath: query.sourcePath,
        bundleRoot,
        syntax: query.syntax,
        find: query.find,
      });
      if (action.action === "passthrough") {
        return undefined;
      }
      if (action.action === "unresolved") {
        return { status: "unresolved" };
      }
      return { status: "resolved", path: action.path };
    },
    linkText(query) {
      const bundleRoot = owningBundle(
        bundlesFor(query.vaultRoot),
        query.sourcePath,
      );
      if (bundleRoot === undefined) {
        return undefined;
      }
      return okfLinkText(bundleRoot, query.sourcePath, query.targetPath);
    },
  };
}
