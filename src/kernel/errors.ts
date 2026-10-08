export type KernelErrorCode = "UndeclaredService" | "DuplicateService" | "PluginFailed" | "PluginDisabled" | "Disposed";
export class KernelError extends Error {
  constructor(
    readonly code: KernelErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = code;
  }
}
