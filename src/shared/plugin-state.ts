import { Schema, type Context, type Infer } from "../kernel";
export const runtimePluginState = Schema.object({
  id: Schema.string().max(256),
  state: Schema.union(["pending", "loading", "active", "failed"]),
  waitingFor: Schema.array(Schema.string()).max(100),
  error: Schema.string().max(2000).optional(),
});
export const runtimePluginStates = Schema.array(runtimePluginState).max(1000);
export type RuntimePluginState = Infer<typeof runtimePluginState>;
export function runtimeStates(root: Context): RuntimePluginState[] {
  return [...root.runtime.fibers]
    .filter((fiber) => fiber.state !== "disposed")
    .map((fiber) => ({
      id: fiber.definition.name,
      state: fiber.state as Exclude<typeof fiber.state, "disposed">,
      waitingFor: [...fiber.waitingFor],
      ...(fiber.error ? { error: String(fiber.error).slice(0, 2000) } : {}),
    }));
}
