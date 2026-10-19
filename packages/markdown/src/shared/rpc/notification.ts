import type { Handler, Notify } from "./endpoint-types";
import type { Logger } from "@workshop/core";
import { CancelToken } from "./lifecycle";

export async function deliverNotification(
  envelope: Notify,
  handlers: Iterable<Handler>,
  live: () => boolean,
  logger: Logger,
): Promise<void> {
  for (const handler of [...handlers]) {
    if (!live()) {
      return;
    }
    try {
      await handler.run(
        handler.protocol.notifications[envelope.method]!.parse(envelope.params),
        new CancelToken(),
      );
    } catch (error) {
      logger.warn("Dropped notification or failed listener", error);
    }
  }
}
