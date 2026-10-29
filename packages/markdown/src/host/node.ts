/**
 * Node implementations of host-service parts, for the hosts that run in Node
 * (VS Code's extension host, host-node). Nothing here may import `vscode`.
 */
export { nodeWorkerLauncher } from "./node-workers";
export { realContains } from "./real-contains";
export {
  createSpawnBlameRunner,
  discoverGitRoot,
  runBlameLine,
  type GitBlameRunner,
} from "./git-blame";
export { bindDiscoveredRoot, canonicalPath } from "./git-discovered-watch";
export { RepositoryWatch } from "./git-watch";
