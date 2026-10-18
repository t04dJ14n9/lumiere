import type { BaseContext, Services } from "@workshop/core";
import type { IdeContextTempFiles } from "@workshop/agents/ide-context";
import type { WorkerLauncher } from "./workers";

/**
 * SHA-256 digests as lowercase hex. Synchronous: they run on every edit
 * (document fingerprints) and for every indexed note.
 */
export interface Digests {
  sha256(data: string | Uint8Array): string;
  hmacSha256(key: Uint8Array, data: string): string;
}

/** Symbolic links on a local disk. Absent where there is none (the browser). */
export interface RealPaths {
  /**
   * Whether `target` lies inside `root` once both are resolved through
   * symbolic links. Both are file-system paths. A missing path rejects,
   * unless `missing` is "nearest-ancestor": then `target`'s nearest
   * existing ancestor stands in for it.
   */
  isInside(
    root: string,
    target: string,
    missing?: "reject" | "nearest-ancestor",
  ): Promise<boolean>;
}

/**
 * Files agents read from the temp folder: scratch files for Copy Link for
 * Agent and published IDE context packets. Desktop only: in the browser no
 * agent can read them.
 */
export interface AgentFiles {
  /** Write `text` as `name` in a private temp folder `folder`; returns its path. */
  writeScratchFile(folder: string, name: string, text: string): Promise<string>;
  readonly ideContext: IdeContextTempFiles;
}

/** The user's operating system, by Node's `process.platform` names. */
export interface OperatingSystem {
  readonly platform: string;
}

/**
 * What the extension needs from where it runs. The composition root builds
 * one (`src/platform`) and hands it to both products; an absent member is a
 * capability the platform does not have.
 */
export interface HostPlatform {
  readonly os: OperatingSystem;
  readonly digests: Digests;
  readonly workers: WorkerLauncher;
  readonly realPaths?: RealPaths;
  readonly agentFiles?: AgentFiles;
}

declare module "@workshop/core" {
  interface Services {
    /** The platform (see `HostPlatform`), provided by the composition root. */
    os: OperatingSystem;
    digests: Digests;
    /** Desktop only. */
    realPaths: RealPaths;
    /** Desktop only. */
    agentFiles: AgentFiles;
  }
}

/** The services `providePlatform` may publish. */
export const PLATFORM_SERVICE_NAMES = [
  "os",
  "digests",
  "realPaths",
  "agentFiles",
] as const satisfies readonly (keyof Services)[];

/** Publish the platform's services in a plugin tree; absent ones stay absent. */
export function providePlatform(
  root: BaseContext,
  platform: HostPlatform,
): void {
  root.provide("os", platform.os);
  root.provide("digests", platform.digests);
  if (platform.realPaths) {
    root.provide("realPaths", platform.realPaths);
  }
  if (platform.agentFiles) {
    root.provide("agentFiles", platform.agentFiles);
  }
}
