/** Log details cross the webview boundary as bounded text, never arbitrary objects. */
export function logText(value: unknown): string {
  try {
    if (value instanceof Error) {
      return `${value.name}: ${value.message}`.slice(0, 8000);
    }
    return (
      typeof value === "string" ? value : (JSON.stringify(value) ?? "")
    ).slice(0, 8000);
  } catch {
    return "[Unserializable log detail]";
  }
}
