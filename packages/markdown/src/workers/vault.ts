// The vault worker's Node entry point (dist/workers/vault.cjs).
import { nodeWorkerPort } from "./node-port";
import { serveVault } from "./vault-worker";

const port = nodeWorkerPort();
if (port) {
  serveVault(port);
}
