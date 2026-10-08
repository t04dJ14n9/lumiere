const characters = /^[\p{L}\p{N}\p{M}\p{S}_/\-\u200d]+/u;
export function readTag(text: string, at: number): string | undefined {
  if (text[at] !== "#" || (at > 0 && /[\p{L}\p{N}\p{M}\p{S}_/#\-\u200d]/u.test(text[at - 1]!))) {
    return;
  }
  const value = characters.exec(text.slice(at + 1))?.[0];
  return value && /[^\p{N}]/u.test(value) ? value : undefined;
}
export function validTag(value: unknown): value is string {
  return typeof value === "string" && value.length <= 1024 && readTag("#" + value, 0) === value;
}
export function tagMatches(value: string, requested: string): boolean {
  value = value.toLowerCase();
  requested = requested.toLowerCase();
  return value === requested || value.startsWith(requested + "/");
}
