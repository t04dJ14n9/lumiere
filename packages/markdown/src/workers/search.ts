import { queryRequirements } from "../markdown/search/plan";
import { parentPort, workerData } from "node:worker_threads";
import { compileSearch } from "../markdown/search/evaluate";
import { parseSearch, searchesFiles } from "../markdown/search/query";
import {
  startup,
  submission,
  workerReply,
} from "../plugins/search/worker-protocol";
import { errorMessage } from "../shared/errors";
const port = parentPort;
if (!port) {
  throw new Error("Search evaluation requires a worker thread");
}
function send(value: unknown): void {
  port?.postMessage(workerReply(value));
}
try {
  const query = parseSearch(startup.parse(workerData).query);
  const matches = compileSearch(query);
  port.on("message", (value: unknown) => {
    let request;
    try {
      request = submission.parse(value);
    } catch {
      send({ type: "error", message: "Invalid search submission" });
      return;
    }
    try {
      send({
        type: "result",
        id: request.id,
        matched: matches(request.document),
      });
    } catch (error) {
      send({ type: "rejected", id: request.id, message: errorMessage(error) });
    }
  });
  const needs = queryRequirements(query);
  send({
    type: "ready",
    files: searchesFiles(query),
    content: needs.text,
    metadata: needs.metadata,
  });
} catch (error) {
  send({ type: "error", message: errorMessage(error) });
  port.close();
}
