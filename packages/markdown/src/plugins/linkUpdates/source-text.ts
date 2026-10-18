import type { HostDocuments } from "../../shared/host";
import type { Vaults } from "../vault/api";

/**
 * A note's text as VS Code holds it. An open document can differ from the
 * vault's copy (unsaved edits, or a buffer left over from a closed editor),
 * and the edits apply to that document, so offsets must come from it.
 */
export async function sourceText(
  vaults: Pick<Vaults, "text">,
  documents: Pick<HostDocuments, "text">,
  uri: string,
): Promise<string> {
  return documents.text(uri) ?? (await vaults.text(uri));
}
