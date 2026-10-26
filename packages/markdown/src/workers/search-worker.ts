import { queryRequirements } from "../markdown/search/plan";
import { compileSearch } from "../markdown/search/evaluate";
import { parseSearch, searchesFiles } from "../markdown/search/query";
import {
  startup,
  submission,
  workerReply,
} from "../plugins/search/worker-protocol";
import { errorMessage } from "../shared/errors";
import type { WorkerPort } from "../shared/workers";

/** One query per worker: the query arrives as the start data. */
export function serveSearch(port: WorkerPort): void {
  const send = (value: unknown) => port.post(workerReply(value));
  try {
    const query = parseSearch(startup.parse(port.data).query);
    const matches = compileSearch(query);
    port.onMessage((value: unknown) => {
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
        send({
          type: "rejected",
          id: request.id,
          message: errorMessage(error),
        });
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
}
