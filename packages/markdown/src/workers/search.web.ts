// The search worker's browser entry point (dist/workers/search.js).
import { serveSearch } from "./search-worker";
import { startWebWorker } from "./web-port";

startWebWorker(self as unknown as DedicatedWorkerGlobalScope, serveSearch);
