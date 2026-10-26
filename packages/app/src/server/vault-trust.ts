/** The owner's answers about running a vault's plugins (shared/vault-trust.ts), in a file. */
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { VaultTrust } from "../shared/vault-trust";
import { saveFile } from "./json-file";

export {
  VaultTrust,
  readAnswers,
  type TrustQuestion,
} from "../shared/vault-trust";

/** The answers kept in `file` (`trust.json` in the data folder). */
export function fileVaultTrust(file: string): VaultTrust {
  return new VaultTrust(
    {
      read: () => readFile(file, "utf8").catch(() => undefined),
      write: (text) => saveFile(file, text),
    },
    fileURLToPath,
  );
}
