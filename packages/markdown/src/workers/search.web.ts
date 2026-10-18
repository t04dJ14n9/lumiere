// The search worker's browser entry point (dist/markdown/workers/search.js).
import { startWebWorker } from "@workshop/platform/web";
import { serveSearch } from "./search-worker";

startWebWorker(self, serveSearch);
