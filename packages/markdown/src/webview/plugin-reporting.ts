import type { Endpoint } from "../shared/rpc/endpoint";
import type { RootContext } from "@workshop/core";
import { runtimeStates } from "../shared/plugin-state";
import { protocol } from "../plugins/editor/protocol";
import { featureController } from "./features";
/** The RPC response waits for queued reconfiguration, so API writes report applied states. */
export function pluginReporting(
  root: RootContext,
  rpc: Endpoint,
  configure = featureController(root),
) {
  let updates = Promise.resolve();
  const publish = () =>
    rpc.notify(protocol, "pluginsChanged", runtimeStates(root));
  const update: typeof configure = (settings, defaults) => {
    updates = configure(settings, defaults).then(publish);
    return updates;
  };
  root.effect(() =>
    // Returned, so the endpoint counts the reconfiguration as part of
    // applying the notification (R3-6). Never rejects; failures are logged.
    rpc.on(protocol, "configure", (settings) =>
      update(settings).catch((error: unknown) =>
        root.logger.error("Feature settings failed", error),
      ),
    ),
  );
  root.effect(() =>
    rpc.handle(protocol, "plugins", async () => {
      await updates;
      await root.settled();
      return runtimeStates(root);
    }),
  );
  return update;
}
