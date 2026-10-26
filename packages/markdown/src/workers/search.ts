// The search worker's Node entry point (dist/workers/search.cjs).
import { nodeWorkerPort } from "./node-port";
import { serveSearch } from "./search-worker";

const port = nodeWorkerPort();
if (!port) {
  throw new Error("Search evaluation requires a worker thread");
}
serveSearch(port);
