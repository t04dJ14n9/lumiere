/** One of the window's own JSON files, in the host's data folder (host-web's mounts). */
import type { Mounts } from "@workshop/host-web";
import { parentUri } from "@workshop/host-node/core";
import type { TextFile } from "../shared/vault-trust";

export function dataFile(files: Mounts, path: string): TextFile {
  const uri = files.uriOf(path);
  return {
    read: () => files.readText(uri).catch(() => undefined),
    async write(text) {
      await files.mkdir(parentUri(files, uri));
      await files.create(uri);
      await files.save(uri, text);
    },
  };
}
