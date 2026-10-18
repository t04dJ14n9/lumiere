/**
 * The desktop platform: Node worker threads, `node:crypto` digests, real
 * paths on the local disk and agent files in the system temp folder.
 */
import path from "node:path";
import type { HostPlatform } from "../services";
import { nodeAgentFiles } from "./agent-files";
import { nodeDigests } from "./digests";
import { nodeRealPaths } from "./real-paths";
import { nodeWorkerLauncher } from "./workers";

export { nodeAgentFiles } from "./agent-files";
export { nodeDigests } from "./digests";
export { pathToFileUriString } from "./file-uri";
export { nodeRealPaths } from "./real-paths";
export { nodeWorkerLauncher, nodeWorkerPort } from "./workers";

/** The platform for the extension installed at `extensionPath`. */
export function nodePlatform(extensionPath: string): HostPlatform {
  return {
    os: { platform: process.platform },
    digests: nodeDigests,
    workers: nodeWorkerLauncher(
      path.join(extensionPath, "dist", "markdown", "workers"),
    ),
    realPaths: nodeRealPaths,
    agentFiles: nodeAgentFiles,
  };
}
