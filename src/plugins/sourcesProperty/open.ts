import { planResourceOpen, sourceRows } from "../../markdown/okf";
import { noteFragment } from "../../markdown/metadata/fragments";
import { frontmatter } from "../../markdown/properties";

export interface SourceOpenPlan {
  action: "external" | "workspace" | "refuse";
  url?: string;
  path?: string;
  fragment?: string;
  reason?: string;
}

/**
 * Authorize one Sources row from the owning document's current text.
 * A resource that is no longer in the document is refused. Nothing is fetched.
 */
export function planSourceOpen(input: {
  resource: string;
  text: string;
  documentPath: string;
  bundleRoot?: string;
  live: boolean;
}): SourceOpenPlan {
  if (!input.live) {
    return { action: "refuse", reason: "okf is off" };
  }
  if (!listed(input.text, input.resource)) {
    return { action: "refuse", reason: "stale source" };
  }
  const plan = planResourceOpen({
    resource: input.resource,
    documentPath: input.documentPath,
    ...(input.bundleRoot === undefined ? {} : { bundleRoot: input.bundleRoot }),
  });
  if (plan.action === "external") {
    return { action: "external", url: plan.url };
  }
  if (plan.action === "workspace") {
    return {
      action: "workspace",
      path: plan.path,
      ...(plan.fragment ? { fragment: plan.fragment } : {}),
    };
  }
  return {
    action: "refuse",
    reason: plan.action === "text" ? "not a link" : plan.reason,
  };
}

/**
 * Heading and block fragments become an offset `vaults.open` already accepts.
 * A page fragment has no viewer here; the file still opens without one.
 */
export function supportedFragmentOffset(
  text: string,
  fragment: string | undefined,
): number | undefined {
  if (!fragment || fragment === "#") {
    return undefined;
  }
  const body = fragment.startsWith("#") ? fragment.slice(1) : fragment;
  if (body.startsWith("page=")) {
    return undefined;
  }
  return noteFragment(text, body)?.from;
}

function listed(text: string, resource: string): boolean {
  const values = frontmatter(text)?.values;
  if (!values || !Object.hasOwn(values, "sources")) {
    return false;
  }
  return sourceRows(values.sources, values).some(
    (row) => row.resource === resource,
  );
}
