import type { Context } from "../../kernel";
import type { DiffSide } from "../../shared/git";
import type {} from "../resources/api";
export async function prepareResources(
  ctx: Context,
  left: DiffSide,
  right: DiffSide,
) {
  if (!ctx.diffResources) {
    return undefined;
  }
  // One failed side must not suppress the other side's images.
  const sides = await Promise.allSettled([
    ctx.diffResources.forSide(left),
    ctx.diffResources.forSide(right),
  ]);
  const access = sides.map((side) =>
    side.status === "fulfilled" ? side.value : undefined,
  );
  return {
    roots: access.flatMap((side) => (side ? [side.root] : [])),
    async load(side: "left" | "right", target: string) {
      const resources = access[side === "left" ? 0 : 1];
      if (!resources) {
        throw new Error("Image source unavailable");
      }
      return resources.load(target);
    },
  };
}
