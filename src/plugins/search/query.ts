import type { VaultIndex, VaultFile } from "../vault/api";
import type { Cancellation } from "../../shared/rpc/lifecycle";
import { RpcError } from "../../shared/rpc/lifecycle";
import { folderOf, nameOf, relativeVaultPath } from "../../shared/vault-path";
import type { SearchEvaluator } from "./runner";
import type { SearchResponse } from "./protocol";
export interface SearchInput {
  vault: VaultIndex;
  source: string;
  worker: SearchEvaluator;
  token: Cancellation;
  read(uri: string): Promise<string>;
}
export async function searchVault(input: SearchInput): Promise<SearchResponse> {
  const { vault, source, worker, token, read } = input;
  const origin = vault.files().find((file) => file.uri === source);
  if (!origin) {
    throw new Error("Unknown search source");
  }
  await worker.ready;
  const results: SearchResponse["results"] = [];
  let unreadable = 0;
  const files = vault
    .files()
    .filter((file) => !file.excluded)
    .sort((a, b) => a.path.localeCompare(b.path));
  for (const file of files) {
    if (token.cancelled) {
      throw new RpcError("Cancelled", "Search cancelled");
    }
    const kind = documentKind(file.extension);
    if (kind === "file" && !worker.includesFiles) {
      continue;
    }
    try {
      const document = await searchDocument({ vault, worker, read }, file);
      if (token.cancelled) {
        throw new RpcError("Cancelled", "Search cancelled");
      }
      if (await worker.matches(document)) {
        const href = relativeVaultPath(folderOf(origin.path), file.path)
          .split("/")
          .map(encodeURIComponent)
          .join("/");
        results.push({ path: file.path, href });
      }
    } catch (error) {
      if (worker.stopped || token.cancelled) {
        throw error;
      }
      unreadable++;
    }
  }
  results.sort(
    (a, b) =>
      nameOf(a.path).localeCompare(nameOf(b.path)) ||
      a.path.localeCompare(b.path),
  );
  return { results, unreadable };
}
function documentKind(extension: string): "markdown" | "canvas" | "file" {
  if (/^(md|markdown)$/i.test(extension)) {
    return "markdown";
  }
  return extension.toLowerCase() === "canvas" ? "canvas" : "file";
}

async function searchDocument(
  input: Pick<SearchInput, "vault" | "worker" | "read">,
  file: VaultFile,
) {
  const kind = documentKind(file.extension);
  const cached =
    input.worker.requiresMetadata && !input.worker.requiresText
      ? input.vault.metadata(file.path)
      : undefined;
  const metadata = cached
    ? {
        tags: cached.tags.map(({ tag }) => tag.replace(/^#/, "")),
        properties: cached.frontmatter ?? {},
      }
    : undefined;
  const needsMetadata =
    input.worker.requiresMetadata && kind === "markdown" && !metadata;
  const read = kind !== "file" && (input.worker.requiresText || needsMetadata);
  return {
    path: file.path,
    kind,
    text: read ? await input.read(file.uri) : "",
    metadata: read ? undefined : metadata,
  };
}
