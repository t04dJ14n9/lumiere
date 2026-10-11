/** A file name that does not collide, comparing names case-insensitively. */
export function uniqueFileName(
  name: string,
  existing: readonly string[],
): string {
  const taken = new Set(existing.map((item) => item.toLowerCase()));
  if (!taken.has(name.toLowerCase())) {
    return name;
  }
  const dot = name.lastIndexOf(".");
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const extension = dot > 0 ? name.slice(dot) : "";
  let index = 2;
  let candidate = `${stem}-${index}${extension}`;
  while (taken.has(candidate.toLowerCase())) {
    index += 1;
    candidate = `${stem}-${index}${extension}`;
  }
  return candidate;
}
