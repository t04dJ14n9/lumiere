import { Schema, type Infer, type RootContext } from "@workshop/core";
export const runtimePluginState = Schema.object({
  id: Schema.string().max(256),
  state: Schema.union(["pending", "loading", "active", "failed"]),
  waitingFor: Schema.array(Schema.string()).max(100),
  error: Schema.string().max(2000).optional(),
});
export const runtimePluginStates = Schema.array(runtimePluginState).max(1000);
export type RuntimePluginState = Infer<typeof runtimePluginState>;
/** The plugins of one tree (the extension host or a panel), as status reports show them. */
export interface PluginStates {
  list(): RuntimePluginState[];
}
declare module "@workshop/core" {
  interface Services {
    pluginStates: PluginStates;
  }
}
/** Let the tree's plugins read its plugin states (the public API, Show Plugin Status). */
export function providePluginStates(root: RootContext): void {
  root.provide("pluginStates", { list: () => runtimeStates(root) });
}
export function runtimeStates(root: RootContext): RuntimePluginState[] {
  return [...root.plugins]
    .filter((fiber) => fiber.state !== "disposed")
    .map((fiber) => ({
      id: fiber.definition.name,
      state: fiber.state as Exclude<typeof fiber.state, "disposed">,
      waitingFor: [...fiber.waitingFor],
      ...(fiber.error ? { error: String(fiber.error).slice(0, 2000) } : {}),
    }));
}
