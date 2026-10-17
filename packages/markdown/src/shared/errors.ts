/**
 * The message of an error for display, without the "Error: " prefix that
 * `String(error)` adds. Errors passed between the worker, the host and the
 * webview would otherwise collect one prefix per hop.
 */
export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
