// The search worker's Node entry point (dist/markdown/workers/search.cjs).
import { nodeWorkerPort } from "@workshop/platform/node";
import { serveSearch } from "./search-worker";

const port = nodeWorkerPort();
if (!port) {
  throw new Error("Search evaluation requires a worker thread");
}
serveSearch(port);
