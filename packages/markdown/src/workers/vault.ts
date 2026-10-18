// The vault worker's Node entry point (dist/markdown/workers/vault.cjs).
import { nodeWorkerPort } from "@workshop/platform/node";
import { serveVault } from "./vault-worker";

const port = nodeWorkerPort();
if (port) {
  serveVault(port);
}
