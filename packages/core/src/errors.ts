export type CoreErrorCode =
  "UndeclaredService" | "DuplicateService" | "PluginFailed" | "Disposed";

/** An error raised by the plugin core itself, as opposed to by a plugin. */
export class CoreError extends Error {
  constructor(
    readonly code: CoreErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = code;
  }
}
