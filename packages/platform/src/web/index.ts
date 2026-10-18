/**
 * The browser platform (vscode.dev, github.dev, the demo): web workers and
 * JavaScript digests. There is no local disk and no agent that reads files,
 * so `realPaths` and `agentFiles` are absent.
 */
import type { HostPlatform } from "../services";
import { webDigests } from "./digests";
import { browserOperatingSystem } from "./os";
import { webWorkerLauncher } from "./workers";

export { webDigests } from "./digests";
export { browserOperatingSystem } from "./os";
export { startWebWorker, webWorkerLauncher } from "./workers";

/** The platform for the extension whose worker bundles are at `workersUrl`. */
export function webPlatform(workersUrl: string): HostPlatform {
  return {
    os: browserOperatingSystem(navigator.userAgent),
    digests: webDigests,
    workers: webWorkerLauncher(workersUrl),
  };
}
