import type { Endpoint } from "../shared/rpc/endpoint";
import type { Context } from "../kernel";
import { runtimeStates } from "../shared/plugin-state";
import { protocol } from "../plugins/editor/protocol";
import { featureController } from "./features";
/** The RPC response waits for queued reconfiguration, so API writes report applied states. */
export function pluginReporting(root: Context, rpc: Endpoint) {
  const configure = featureController(root);
  let updates = Promise.resolve();
  const publish = () =>
    rpc.notify(protocol, "pluginsChanged", runtimeStates(root));
  const update: typeof configure = (settings, defaults) => {
    updates = configure(settings, defaults).then(publish);
    return updates;
  };
  root.effect(() =>
    rpc.on(protocol, "configure", (settings) => {
      void update(settings).catch((error) =>
        root.logger.error("Feature settings failed", error),
      );
    }),
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
