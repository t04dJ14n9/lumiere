export interface Logger {
  debug(message: string, details?: unknown): void;
  warn(message: string, details?: unknown): void;
  error(message: string, details?: unknown): void;
}
export const silentLogger: Logger = { debug() {}, warn() {}, error() {} };
export function taggedLogger(logger: Logger, tag: string): Logger {
  return Object.fromEntries(
    ["debug", "warn", "error"].map((level) => [
      level,
      (message: string, details?: unknown) =>
        logger[level as keyof Logger](`[${tag}] ${message}`, details),
    ]),
  ) as unknown as Logger;
}
