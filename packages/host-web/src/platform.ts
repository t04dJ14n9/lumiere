/**
 * The shared host's platform in a browser or an iPad's web view
 * (`HostPlatform`): the mounted folders (mounts.ts), the host's own data in
 * one of them, web workers, and a synchronous SHA-256.
 */
import {
  parentUri,
  type HostPlatform,
  type HostStore,
} from "@workshop/host-node/core";
import type { WorkerLauncher } from "@workshop/markdown/portable";
import type { Mounts } from "./mounts";
import { sha256 } from "./sha256";

export interface WebPlatformOptions {
  readonly files: Mounts;
  /** The mounted folder that holds the host's own data (`/lumiere-data`). */
  readonly dataRoot: string;
  readonly workers: WorkerLauncher;
}

export function createWebPlatform(options: WebPlatformOptions): HostPlatform {
  const { files } = options;
  const dataUri = (name: string) => files.uriOf(`${options.dataRoot}/${name}`);
  const store: HostStore = {
    async read(name) {
      try {
        return await files.readText(dataUri(name));
      } catch {
        return undefined;
      }
    },
    async write(name, text) {
      const uri = dataUri(name);
      await files.mkdir(parentUri(files, uri));
      await files.create(uri);
      await files.save(uri, text);
    },
  };
  return {
    files,
    store,
    workers: options.workers,
    sha256,
    async writeScratchFile(name, text) {
      const scratch = `agent/${name.split("/").pop() ?? "passage.md"}`;
      await store.write(scratch, text);
      return dataUri(scratch);
    },
  };
}
