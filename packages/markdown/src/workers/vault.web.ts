// The vault worker's browser entry point (dist/markdown/workers/vault.js).
import { startWebWorker } from "@workshop/platform/web";
import { serveVault } from "./vault-worker";

startWebWorker(self, serveVault);
