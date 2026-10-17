import type { Uri } from "vscode";
import type { AgentReferenceInput } from "../../shared/agent-reference-input";
import type { HostServices } from "../../shared/host";
import type { ApiPlatform } from "./platform";

/** Relative references search workspace roots only; full URIs stay explicit. */
export async function resolveReference(
  reference: AgentReferenceInput,
  host: HostServices,
  platform: ApiPlatform,
): Promise<Uri | undefined> {
  if (reference.isUri) {
    if (!/^[A-Za-z][A-Za-z0-9+.-]*:\//.test(reference.location)) {
      throw new Error("The reference must use an absolute URI path.");
    }
    const uri = platform.uri(reference.location);
    validateMarkdownUri(uri);
    return uri;
  }
  const roots = host.workspace.folders() ?? [];
  if (!roots.length) {
    throw new Error("Open a workspace folder or use a full note URI.");
  }
  const candidates = await referenceCandidates(
    reference,
    roots,
    host,
    platform,
  );
  if (candidates.length === 1) {
    return confirmCandidate(candidates[0]!, host, platform);
  }
  const picked = await host.dialogs.pick({
    placeholder:
      "This reference matches multiple workspace folders. Choose the note to open.",
    items: (query) =>
      candidates
        .filter(({ root }) => root.toLowerCase().includes(query.toLowerCase()))
        .map(({ root, uri }) => ({
          label: reference.location,
          description: root,
          value: uri,
        })),
  });
  const selected = candidates.find(({ uri }) => uri === picked?.item?.value);
  return selected && confirmCandidate(selected, host, platform);
}

async function referenceCandidates(
  reference: AgentReferenceInput,
  roots: readonly string[],
  host: HostServices,
  platform: ApiPlatform,
): Promise<{ root: string; uri: Uri }[]> {
  const candidates: { root: string; uri: Uri }[] = [];
  let containmentError: unknown;
  for (const root of new Set(roots)) {
    const base = platform.uri(root);
    const uri = platform.joinPath(base, reference.location);
    validateMarkdownUri(uri);
    try {
      await platform.assertContained(base, uri);
    } catch (error) {
      containmentError ??= error;
      continue;
    }
    if (await exists(host, uri)) {
      candidates.push({ root, uri });
    }
  }
  if (!candidates.length) {
    if (containmentError) {
      throw containmentError;
    }
    throw new Error(
      "The referenced Markdown file was not found in this workspace.",
    );
  }
  return candidates;
}

async function confirmCandidate(
  candidate: { root: string; uri: Uri },
  host: HostServices,
  platform: ApiPlatform,
): Promise<Uri> {
  if (!host.workspace.folders().includes(candidate.root)) {
    throw new Error("The reference's workspace folder is no longer open.");
  }
  // A picker can stay open while folders or symlinks change. Check again
  // after the choice, rather than trusting a previously safe candidate.
  await platform.assertContained(platform.uri(candidate.root), candidate.uri);
  return candidate.uri;
}

function validateMarkdownUri(uri: Uri): void {
  if (
    !uri.scheme ||
    !uri.path.startsWith("/") ||
    !/\.(md|markdown)$/i.test(uri.path)
  ) {
    throw new Error(
      "The reference must identify a Markdown file with an absolute URI path.",
    );
  }
}

async function exists(host: HostServices, uri: Uri): Promise<boolean> {
  try {
    await host.workspace.stat(uri.toString());
    return true;
  } catch {
    return false;
  }
}
