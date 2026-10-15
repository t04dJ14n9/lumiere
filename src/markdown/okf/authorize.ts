import {
  decodeLinkPath,
  extensionOf,
  folderOf,
  joinVaultPath,
  splitLinktext,
} from "../../shared/vault-path";

export type ResourcePlan =
  | { action: "external"; url: string }
  | { action: "workspace"; path: string; fragment?: string }
  | { action: "text" }
  | { action: "refuse"; reason: string };

const REJECTED_SCHEMES = new Set(["command", "javascript", "data", "vbscript"]);

/**
 * How a Sources `resource` may be opened. External http(s) only; workspace
 * paths must stay inside the vault. Scope-description text is not a link.
 * Nothing here fetches the target.
 */
export function planResourceOpen(input: {
  resource: string;
  documentPath: string;
  bundleRoot?: string;
}): ResourcePlan {
  const resource = input.resource.trim();
  if (!resource) {
    return { action: "text" };
  }
  const scheme = schemeOf(resource);
  if (scheme) {
    return schemePlan(scheme, resource);
  }
  if (isScopeText(resource)) {
    return { action: "text" };
  }
  const target = workspaceTarget(
    resource,
    input.documentPath,
    input.bundleRoot,
  );
  if (!target) {
    return { action: "refuse", reason: "outside the vault" };
  }
  return {
    action: "workspace",
    path: target.path,
    ...(target.fragment ? { fragment: target.fragment } : {}),
  };
}

function schemeOf(resource: string): string | undefined {
  const match = /^([a-z][a-z0-9+.-]*):/i.exec(resource);
  return match ? match[1]!.toLowerCase() : undefined;
}

function schemePlan(scheme: string, resource: string): ResourcePlan {
  if (
    REJECTED_SCHEMES.has(scheme) ||
    (scheme !== "http" && scheme !== "https")
  ) {
    return { action: "refuse", reason: "unsupported scheme" };
  }
  const url = httpUrl(scheme, resource);
  if (!url) {
    return { action: "refuse", reason: "invalid url" };
  }
  return { action: "external", url };
}

/** http(s) only, without the DOM URL parser. The pure layer has no URL global. */
function httpUrl(scheme: string, resource: string): string | undefined {
  const prefix = `${scheme}://`;
  if (!resource.toLowerCase().startsWith(prefix)) {
    return undefined;
  }
  if (/\s|\\/.test(resource)) {
    return undefined;
  }
  const host = resource.slice(prefix.length).split(/[/?#]/, 1)[0];
  if (!host) {
    return undefined;
  }
  return resource;
}

function isScopeText(resource: string): boolean {
  if (
    resource.startsWith("/") ||
    resource.startsWith("./") ||
    resource.startsWith("../")
  ) {
    return false;
  }
  if (resource.includes("/") || resource.includes("\\")) {
    return false;
  }
  return extensionOf(resource) === "";
}

function workspaceTarget(
  resource: string,
  documentPath: string,
  bundleRoot: string | undefined,
): { path: string; fragment: string } | undefined {
  const { path: pathSegment, subpath } = splitLinktext(resource);
  const resourcePath = decodeLinkPath(pathSegment);
  const path = resourcePath.startsWith("/")
    ? joinVaultPath(bundleRoot ?? "", resourcePath.slice(1))
    : joinVaultPath(folderOf(documentPath), resourcePath);
  if (path === undefined) {
    return undefined;
  }
  return { path, fragment: subpath };
}
