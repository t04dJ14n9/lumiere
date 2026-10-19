import type { PropertyScalar } from "../../markdown/properties";

export function itemOccurrence(
  original: readonly PropertyScalar[],
  latest: readonly PropertyScalar[],
  index: number,
): number {
  const selected = original[index];
  let occurrence = original
    .slice(0, index)
    .filter((value) => Object.is(value, selected)).length;
  return latest.findIndex(
    (value) => Object.is(value, selected) && occurrence-- === 0,
  );
}
