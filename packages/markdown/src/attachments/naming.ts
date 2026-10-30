/** A timestamp stem for a new attachment: `2026-10-30 14.52`, local time. */
export function timestampStem(date: Date): string {
  const two = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${two(date.getMonth() + 1)}-${two(date.getDate())} ${two(date.getHours())}.${two(date.getMinutes())}`;
}

/**
 * A unique attachment file name: `YYYY-MM-DD HH.mm.ext`, then
 * `YYYY-MM-DD HH.mm 2.ext` when that name is taken (compared without case).
 * `ext` may be compound (`sketch.svg`) and may omit the leading dot.
 */
export function uniqueTimestampName(
  ext: string,
  existing: readonly string[],
  date: Date = new Date(),
): string {
  const taken = new Set(existing.map((name) => name.toLowerCase()));
  const stem = timestampStem(date);
  const suffix = ext.startsWith(".") ? ext : `.${ext}`;
  for (let count = 1; ; count += 1) {
    const name = `${count === 1 ? stem : `${stem} ${count}`}${suffix}`;
    if (!taken.has(name.toLowerCase())) {
      return name;
    }
  }
}
