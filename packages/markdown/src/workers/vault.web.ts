// The vault worker's browser entry point (dist/workers/vault.js).
import { serveVault } from "./vault-worker";
import { startWebWorker } from "./web-port";

startWebWorker(self as unknown as DedicatedWorkerGlobalScope, serveVault);
